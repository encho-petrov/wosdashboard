import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Users from '../Users';
import client from '../../api/client';
import { toast } from 'react-toastify';

// 1. Mock API Client
vi.mock('../../api/client', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

// 2. Mock Toastify
vi.mock('react-toastify', () => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

// 3. Mock AdminLayout
vi.mock('../../components/layout/AdminLayout', () => ({
    default: ({ children }) => <div data-testid="admin-layout">{children}</div>,
}));

// 4. Save original window functions to restore them later
const originalConfirm = window.confirm;
const originalPrompt = window.prompt;

describe('Users Component', () => {
    const mockUsers = [
        { id: 1, username: 'superadmin', role: 'admin', allianceId: null, mfa_enabled: true, has_webauthn: true },
        { id: 2, username: 'testmod', role: 'moderator', allianceId: 10, mfa_enabled: true, has_webauthn: false },
    ];

    const mockAlliances = [
        { id: 10, name: '[XYZ] Alpha' },
        { id: 20, name: '[ABC] Bravo' },
    ];

    beforeEach(() => {
        vi.clearAllMocks();

        // Auto-approve window dialogs for testing
        window.confirm = vi.fn(() => true);
        window.prompt = vi.fn(() => 'newSecurePass123');

        // Route GET requests to the correct mock data
        client.get.mockImplementation((url) => {
            if (url === '/admin/users') return Promise.resolve({ data: mockUsers });
            if (url === '/moderator/options') return Promise.resolve({ data: { alliances: mockAlliances } });
            return Promise.resolve({ data: [] });
        });
    });

    afterEach(() => {
        // Restore window functions to prevent leaking into other tests
        window.confirm = originalConfirm;
        window.prompt = originalPrompt;
    });

    const renderComponent = () => {
        return render(
            <MemoryRouter>
                <Users />
            </MemoryRouter>
        );
    };

    it('fetches and renders users and alliances on mount', async () => {
        renderComponent();

        expect(screen.getByText('Fetching Records...')).toBeInTheDocument();

        // Verify Users map correctly
        expect(await screen.findByText('superadmin')).toBeInTheDocument();
        expect(screen.getByText('testmod')).toBeInTheDocument();

        // Verify Alliance names map correctly (ID 10 -> [XYZ] Alpha)
        expect(screen.getAllByText('[XYZ] Alpha').length).toBeGreaterThan(0);
        // ID null -> Global Access
        expect(screen.getByText('Global Access')).toBeInTheDocument();
    });

    it('creates a new user successfully', async () => {
        client.post.mockResolvedValueOnce({});
        renderComponent();

        // Wait for initial load
        await screen.findByText('superadmin');

        // Fill out the creation form
        fireEvent.change(screen.getByLabelText(/Username/i), { target: { value: 'newuser' } });
        fireEvent.change(screen.getByLabelText(/Temporary Password/i), { target: { value: 'pass123' } });
        fireEvent.change(screen.getAllByLabelText(/Access Level/i)[0], { target: { value: 'admin' } });
        fireEvent.change(screen.getAllByLabelText(/Alliance Assignment/i)[0], { target: { value: '20' } });

        // Submit the form
        fireEvent.click(screen.getByRole('button', { name: /Provision Access/i }));

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/admin/users', {
                username: 'newuser',
                password: 'pass123',
                role: 'admin',
                allianceId: 20,
            });
            expect(toast.success).toHaveBeenCalledWith('User created!');
            expect(client.get).toHaveBeenCalledTimes(4); // 2 on mount, 2 after creation
        });
    });

    it('prevents user creation if required fields are missing', async () => {
        renderComponent();
        await screen.findByText('superadmin');

        // Instead of clicking the button (which triggers HTML5 native validation blocks),
        // we fire the submit event directly on the form to test our React logic.
        const form = screen.getByRole('button', { name: /Provision Access/i }).closest('form');
        fireEvent.submit(form);

        expect(client.post).not.toHaveBeenCalled();
        expect(toast.warning).toHaveBeenCalledWith('Missing fields');
    });

    it('edits a user role and triggers an alliance transfer request', async () => {
        client.put.mockResolvedValueOnce({});
        client.post.mockResolvedValueOnce({});
        renderComponent();

        await screen.findByText('testmod');

        // Click Edit on User 2 (testmod)
        fireEvent.click(screen.getByTitle('Edit Role & Alliance'));

        // Modal should appear
        expect(screen.getByText(/Edit Access:/i)).toBeInTheDocument();

        // The modal has its own Access Level / Alliance select elements.
        // They are the second ones in the DOM because the Create Form has the first set.
        const accessSelects = screen.getAllByLabelText(/Access Level/i);
        const allianceSelects = screen.getAllByLabelText(/Alliance Assignment/i);

        // Change role from moderator to admin
        fireEvent.change(accessSelects[1], { target: { value: 'admin' } });
        // Change alliance from 10 to 20
        fireEvent.change(allianceSelects[1], { target: { value: '20' } });

        // Save changes
        fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

        await waitFor(() => {
            // 1. Role PUT request
            expect(client.put).toHaveBeenCalledWith('/admin/users/2', {
                role: 'admin',
                allianceId: 10, // PUT retains old alliance ID based on your logic
            });

            // 2. Alliance Transfer POST request
            expect(client.post).toHaveBeenCalledWith('/moderator/admin/request', {
                targetUserId: 2,
                toAllianceId: 20,
            });

            expect(toast.success).toHaveBeenCalledWith('Role updated!');
            expect(toast.info).toHaveBeenCalledWith('Alliance transfer requested! Waiting for approval.');
        });
    });

    it('resets MFA and Biometrics using window.prompt', async () => {
        client.post.mockResolvedValueOnce({});
        renderComponent();

        await screen.findByText('testmod');

        // Click Reset Security on testmod (user 2)
        const resetButtons = screen.getAllByTitle('Reset MFA & Biometrics');
        fireEvent.click(resetButtons[1]); // Index 1 is user 2

        // Verify prompt was called
        expect(window.prompt).toHaveBeenCalled();

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/admin/users/2/reset-security', {
                new_password: 'newSecurePass123', // From our window.prompt mock
            });
            expect(toast.success).toHaveBeenCalledWith('Security reset for testmod. Password updated.');
        });
    });

    it('deletes a user after confirmation', async () => {
        client.delete.mockResolvedValueOnce({});
        renderComponent();

        await screen.findByText('testmod');

        // Delete testmod
        fireEvent.click(screen.getByTitle('Terminate Access'));

        expect(window.confirm).toHaveBeenCalledWith("Terminate this user's access?");

        await waitFor(() => {
            expect(client.delete).toHaveBeenCalledWith('/admin/users/2');
            expect(toast.success).toHaveBeenCalledWith('User removed');
        });
    });

    it('hides edit and delete buttons for the superadmin (id: 1)', async () => {
        renderComponent();
        await screen.findByText('superadmin');

        // The component explicitly checks `u.id !== 1` before rendering these buttons.
        // Since mock data only has 2 users, there should only be ONE edit and ONE delete button.
        expect(screen.getAllByTitle('Edit Role & Alliance')).toHaveLength(1);
        expect(screen.getAllByTitle('Terminate Access')).toHaveLength(1);
    });
});