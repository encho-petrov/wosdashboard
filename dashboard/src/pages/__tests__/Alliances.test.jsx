import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Alliances from '../Alliances';
import client from '../../api/client';
import { toast } from 'react-toastify';

// 1. Mock the API Client
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
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

// 3. Mock AdminLayout
vi.mock('../../components/layout/AdminLayout', () => ({
    default: ({ children }) => <div data-testid="admin-layout">{children}</div>,
}));

// 4. Mock window.confirm so tests don't pause for user input
const originalConfirm = window.confirm;

describe('Alliances Component', () => {
    const mockAlliances = [
        { id: 1, name: '[XYZ] Alpha', type: 'Fighting' },
        { id: 2, name: '[ABC] Bravo', type: 'General' },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true); // Auto-confirm deletions

        // Default GET response
        client.get.mockResolvedValue({ data: mockAlliances });
    });

    afterEach(() => {
        window.confirm = originalConfirm; // Restore confirm
    });

    const renderComponent = () => {
        return render(
            <MemoryRouter>
                <Alliances />
            </MemoryRouter>
        );
    };

    it('fetches and displays alliances on mount', async () => {
        renderComponent();

        expect(await screen.findByText('[XYZ] Alpha')).toBeInTheDocument();
        expect(screen.getByText('FIGHTING')).toBeInTheDocument();

        expect(screen.getByText('[ABC] Bravo')).toBeInTheDocument();
        expect(screen.getByText('GENERAL')).toBeInTheDocument();
    });

    it('opens the create form and submits a new alliance', async () => {
        client.post.mockResolvedValueOnce({}); // Mock successful save
        renderComponent();

        // Wait for load
        await screen.findByText('[XYZ] Alpha');

        // Click "Add New Alliance"
        fireEvent.click(screen.getByRole('button', { name: /Add New Alliance/i }));

        // Form should appear
        expect(screen.getByText('Create New Entry')).toBeInTheDocument();

        // Fill form
        const input = screen.getByPlaceholderText('e.g. [XYZ] Alliance Name');
        fireEvent.change(input, { target: { value: '[NEW] Charlie' } });

        // Save
        fireEvent.click(screen.getByRole('button', { name: /Save/i }));

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/admin/alliances', {
                name: '[NEW] Charlie',
                type: 'General',
            });
            expect(toast.success).toHaveBeenCalledWith('Alliance created');
            // Verify it re-fetches the list
            expect(client.get).toHaveBeenCalledTimes(2);
        });
    });

    it('validates empty names before submitting', async () => {
        renderComponent();
        await screen.findByText('[XYZ] Alpha');

        fireEvent.click(screen.getByRole('button', { name: /Add New Alliance/i }));

        // Click save without typing a name
        fireEvent.click(screen.getByRole('button', { name: /Save/i }));

        expect(client.post).not.toHaveBeenCalled();
        expect(toast.warning).toHaveBeenCalledWith('Name is required');
    });

    it('opens the edit form and updates an existing alliance', async () => {
        client.put.mockResolvedValueOnce({});
        renderComponent();

        await screen.findByText('[XYZ] Alpha');

        // Click the Edit button for the first alliance (Alpha)
        // We use getAllByTitle because both rows have an edit button
        const editButtons = screen.getAllByTitle('Edit Alliance');
        fireEvent.click(editButtons[0]);

        // Form should appear populated
        expect(screen.getByText('Edit Alliance')).toBeInTheDocument();
        const input = screen.getByDisplayValue('[XYZ] Alpha');

        // Change the name
        fireEvent.change(input, { target: { value: '[XYZ] Alpha Updated' } });

        // Save
        fireEvent.click(screen.getByRole('button', { name: /Save/i }));

        await waitFor(() => {
            // It should call PUT with the correct ID (1)
            expect(client.put).toHaveBeenCalledWith('/moderator/admin/alliances/1', {
                name: '[XYZ] Alpha Updated',
                type: 'Fighting', // Should retain the original type
            });
            expect(toast.success).toHaveBeenCalledWith('Alliance updated');
        });
    });

    it('deletes an alliance when confirmed', async () => {
        client.delete.mockResolvedValueOnce({});
        renderComponent();

        await screen.findByText('[XYZ] Alpha');

        const deleteButtons = screen.getAllByTitle('Delete Alliance');
        fireEvent.click(deleteButtons[0]);

        // window.confirm is mocked to return true
        expect(window.confirm).toHaveBeenCalledWith('Delete this alliance?');

        await waitFor(() => {
            expect(client.delete).toHaveBeenCalledWith('/moderator/admin/alliances/1');
            expect(toast.success).toHaveBeenCalledWith('Alliance deleted');
            expect(client.get).toHaveBeenCalledTimes(2); // Re-fetched
        });
    });

    it('re-fetches data when the REFRESH_ALLIANCES event is dispatched', async () => {
        renderComponent();

        // Wait for the initial mount fetch
        await screen.findByText('[XYZ] Alpha');
        expect(client.get).toHaveBeenCalledTimes(1);

        // Simulate the LiveSync manager dispatching the global event
        const event = new Event('REFRESH_ALLIANCES');
        window.dispatchEvent(event);

        // Verify the component reacted and fetched again
        await waitFor(() => {
            expect(client.get).toHaveBeenCalledTimes(2);
        });
    });
});