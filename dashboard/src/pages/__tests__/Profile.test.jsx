import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Profile from '../Profile';
import { useAuth } from '../../context/AuthContext';
import client from '../../api/client';
import { toast } from 'react-toastify';

// 1. Mock the Context
vi.mock('../../context/AuthContext', () => ({
    useAuth: vi.fn(),
}));

// 2. Mock the API Client
vi.mock('../../api/client', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
}));

// 3. Mock Toastify & WebAuthn
vi.mock('react-toastify', () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@simplewebauthn/browser', () => ({
    startRegistration: vi.fn(),
}));

// 4. Mock AdminLayout
vi.mock('../../components/layout/AdminLayout', () => ({
    default: ({ children }) => <div data-testid="admin-layout">{children}</div>,
}));

describe('Profile Component', () => {
    const mockProfileData = {
        username: 'CommanderShepard',
        role: 'admin',
        mfa_enabled: true,
        devices: [],
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Default API successful responses
        client.get.mockImplementation((url) => {
            if (url === '/moderator/profile') {
                return Promise.resolve({ data: mockProfileData });
            }
            if (url === '/moderator/admin/pending') {
                return Promise.resolve({ data: [] });
            }
            return Promise.reject(new Error('Not found'));
        });
    });

    const renderProfile = () => {
        return render(
            <MemoryRouter>
                <Profile />
            </MemoryRouter>
        );
    };

    it('fetches and renders profile data on mount', async () => {
        useAuth.mockReturnValue({ user: { role: 'admin' } });
        renderProfile();

        // Verify it loads the mocked username
        expect(await screen.findByText('CommanderShepard')).toBeInTheDocument();

        // Verify MFA badge renders based on mock data
        expect(screen.getByText(/TOTP Active/i)).toBeInTheDocument();
    });

    it('prevents password submission if new passwords do not match', async () => {
        useAuth.mockReturnValue({ user: { role: 'admin' } });
        renderProfile();

        // Wait for initial load
        await screen.findByText('Change Password');

        // Fill out the form
        fireEvent.change(screen.getByLabelText(/Current Password/i), { target: { value: 'oldpass123' } });
        fireEvent.change(screen.getByLabelText(/^New Password/i), { target: { value: 'newpass123' } });
        fireEvent.change(screen.getByLabelText(/Confirm New Password/i), { target: { value: 'mismatch123' } });

        // Submit
        fireEvent.click(screen.getByRole('button', { name: /Update Password/i }));

        // Verify API was NOT called, and toast error fired
        expect(client.post).not.toHaveBeenCalled();
        expect(toast.error).toHaveBeenCalledWith('New passwords do not match');
    });

    it('submits the password change API call when passwords match', async () => {
        useAuth.mockReturnValue({ user: { role: 'admin' } });
        client.post.mockResolvedValueOnce({}); // Mock successful post

        renderProfile();
        await screen.findByText('Change Password');

        fireEvent.change(screen.getByLabelText(/Current Password/i), { target: { value: 'oldpass123' } });
        fireEvent.change(screen.getByLabelText(/^New Password/i), { target: { value: 'newpass123' } });
        fireEvent.change(screen.getByLabelText(/Confirm New Password/i), { target: { value: 'newpass123' } });

        fireEvent.click(screen.getByRole('button', { name: /Update Password/i }));

        // Wait for the async API call to finish
        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/change-password', {
                old_password: 'oldpass123',
                new_password: 'newpass123'
            });
            expect(toast.success).toHaveBeenCalledWith('Password updated successfully');
        });
    });

    it('shows the Transfer Queue to admins if there are pending transfers', async () => {
        useAuth.mockReturnValue({ user: { role: 'admin' } });

        // Override the GET mock specifically for this test to return a fake transfer
        client.get.mockImplementation((url) => {
            if (url === '/moderator/profile') return Promise.resolve({ data: mockProfileData });
            if (url === '/moderator/admin/pending') return Promise.resolve({
                data: [{ id: 99, requesterName: 'John', targetUsername: 'Jane', createdAt: new Date().toISOString() }]
            });
        });

        renderProfile();

        // Wait for the queue to appear
        expect(await screen.findByText(/Action Required: Transfer Queue/i)).toBeInTheDocument();
        expect(screen.getByText('Jane')).toBeInTheDocument();
    });

    it('does not fetch or show the Transfer Queue for non-admins', async () => {
        // Mock user as a moderator
        useAuth.mockReturnValue({ user: { role: 'moderator' } });
        renderProfile();

        await screen.findByText('CommanderShepard'); // Wait for profile load

        // Verify the pending API was never called
        expect(client.get).not.toHaveBeenCalledWith('/moderator/admin/pending');

        // Verify the UI isn't there
        expect(screen.queryByText(/Action Required: Transfer Queue/i)).not.toBeInTheDocument();
    });
});