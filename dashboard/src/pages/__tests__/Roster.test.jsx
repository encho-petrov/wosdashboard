import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Roster from '../Roster';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { toast } from 'react-toastify';

// 1. Mock Contexts
vi.mock('../../context/AuthContext', () => ({
    useAuth: vi.fn(),
}));

const mockRefreshGlobalData = vi.fn();
vi.mock('../../context/AppContext', () => ({
    useApp: vi.fn(),
}));

// 2. Mock API Client & Toastify
vi.mock('../../api/client', () => ({
    default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('react-toastify', () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// 3. Mock Layout
vi.mock('../../components/layout/AdminLayout', () => ({
    default: ({ children }) => <div data-testid="admin-layout">{children}</div>,
}));

describe('Roster Component', () => {
    const originalConfirm = window.confirm;

    const mockRoster = [
        { fid: 111, nickname: 'AdminPlayer', allianceId: 10, allianceName: '[XYZ] Alpha', normalPower: 500000 },
        { fid: 222, nickname: 'ModPlayer', allianceId: 20, allianceName: '[ABC] Bravo', normalPower: 300000 },
    ];

    const mockOptions = {
        alliances: [
            { id: 10, name: '[XYZ] Alpha', type: 'General' },
            { id: 20, name: '[ABC] Bravo', type: 'General' },
        ],
        teams: [],
        rosterstats: { troopTypes: ['Infantry', 'Lancer'], battleAvailability: ['Full', 'Unavailable'] }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);

        // Setup default App Context
        useApp.mockReturnValue({
            roster: mockRoster,
            globalLoading: false,
            refreshGlobalData: mockRefreshGlobalData
        });

        // Setup default API responses for options and seasons
        client.get.mockImplementation((url) => {
            if (url === '/moderator/options') return Promise.resolve({ data: mockOptions });
            if (url === '/moderator/transfers/active') return Promise.resolve({ data: { season: { id: 1, status: 'Active' } } });
            return Promise.resolve({ data: {} });
        });
    });

    afterEach(() => {
        window.confirm = originalConfirm;
    });

    const renderComponent = () => {
        return render(
            <MemoryRouter>
                <Roster />
            </MemoryRouter>
        );
    };

    it('renders all players for an Admin and shows admin controls', async () => {
        useAuth.mockReturnValue({ user: { role: 'admin', allianceId: null } });
        renderComponent();

        // Wait for the data to process
        const adminPlayers = await screen.findAllByText('AdminPlayer');
        expect(adminPlayers.length).toBeGreaterThan(0);

        expect(screen.getAllByText('ModPlayer').length).toBeGreaterThan(0);

        // Admin controls should be visible
        expect(screen.getByRole('button', { name: /Sync/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Import/i })).toBeInTheDocument();
    });

    it('restricts view for Moderators and hides admin controls', async () => {
        // Moderator belongs to alliance 20 ([ABC] Bravo)
        useAuth.mockReturnValue({ user: { role: 'moderator', allianceId: 20, username: 'ModUser' } });
        renderComponent();

        const modPlayers = await screen.findAllByText('ModPlayer');
        expect(modPlayers.length).toBeGreaterThan(0);

        // AdminPlayer should NOT be in the document at all
        expect(screen.queryByText('AdminPlayer')).not.toBeInTheDocument();

        // Admin buttons should NOT exist
        expect(screen.queryByRole('button', { name: /Sync/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Import/i })).not.toBeInTheDocument();

        // Check restricted view text
        expect(screen.getByText('Restricted View: ModUser')).toBeInTheDocument();
    });

    it('filters players based on search term', async () => {
        useAuth.mockReturnValue({ user: { role: 'admin' } });
        renderComponent();

        await screen.findAllByText('AdminPlayer');

        const searchInput = screen.getByPlaceholderText('Name or FID...');
        fireEvent.change(searchInput, { target: { value: 'Mod' } });

        // AdminPlayer should disappear
        expect(screen.queryByText('AdminPlayer')).not.toBeInTheDocument();

        const modPlayers = await screen.findAllByText('ModPlayer');
        expect(modPlayers.length).toBeGreaterThan(0);
    });

    it('allows an Admin to bulk import players', async () => {
        useAuth.mockReturnValue({ user: { role: 'admin' } });
        client.post.mockResolvedValueOnce({});

        renderComponent();
        await screen.findAllByText('AdminPlayer');

        // Open Modal
        fireEvent.click(screen.getByRole('button', { name: /Import/i }));
        expect(screen.getByText('Bulk Import Player IDs')).toBeInTheDocument();

        // Enter IDs
        const textarea = screen.getByPlaceholderText('1234567, 7512369...');
        fireEvent.change(textarea, { target: { value: '999, 888' } });

        // Submit
        fireEvent.click(screen.getByRole('button', { name: /Deploy to Roster/i }));

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/players', { players: '999, 888' });
            expect(toast.success).toHaveBeenCalledWith('Players successfully drafted to the state roster!');
            expect(mockRefreshGlobalData).toHaveBeenCalledWith(true);
        });
    });

    it('allows inline editing and saving of a player', async () => {
        useAuth.mockReturnValue({ user: { role: 'admin' } });
        client.put.mockResolvedValueOnce({});

        renderComponent();
        await screen.findAllByText('AdminPlayer');// Wait for render

        // Click Edit on AdminPlayer
        const editButtons = screen.getAllByTitle('Edit Player');
        fireEvent.click(editButtons[0]);

        // Find the Base Power input (it will have the default value 500000)
        const powerInput = screen.getByDisplayValue('500000');
        fireEvent.change(powerInput, { target: { value: '600000' } });

        // Click Save
        fireEvent.click(screen.getByTitle('Save Edit'));

        await waitFor(() => {
            expect(client.put).toHaveBeenCalledWith('/moderator/players/111', expect.objectContaining({
                normalPower: 600000
            }));
            expect(toast.success).toHaveBeenCalledWith('Player updated');
            expect(mockRefreshGlobalData).toHaveBeenCalledWith(true);
        });
    });

    it('deletes a player after confirmation', async () => {
        useAuth.mockReturnValue({ user: { role: 'admin' } });
        client.delete.mockResolvedValueOnce({});

        renderComponent();
        await screen.findAllByText('AdminPlayer');

        const deleteButtons = screen.getAllByTitle('Delete Player');
        fireEvent.click(deleteButtons[0]);

        expect(window.confirm).toHaveBeenCalledWith('Remove AdminPlayer from state records?');

        await waitFor(() => {
            expect(client.delete).toHaveBeenCalledWith('/moderator/players/111');
            expect(toast.success).toHaveBeenCalledWith('Player removed');
            expect(mockRefreshGlobalData).toHaveBeenCalledWith(true);
        });
    });

    it('opens the transfer out modal and executes the transfer', async () => {
        useAuth.mockReturnValue({ user: { role: 'admin' } });
        client.post.mockResolvedValueOnce({});

        renderComponent();
        await screen.findAllByText('AdminPlayer');

        // Click Archive/Transfer
        const archiveButtons = screen.getAllByTitle('Archive Player');
        fireEvent.click(archiveButtons[0]);

        // Check modal
        expect(screen.getByText('Offload Player: AdminPlayer')).toBeInTheDocument();

        // Type destination
        const destInput = screen.getByPlaceholderText('Destination State...');
        fireEvent.change(destInput, { target: { value: 'State 500' } });

        // Confirm
        fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));

        await waitFor(() => {
            // The payload matches the handleTransferOut function
            expect(client.post).toHaveBeenCalledWith('/moderator/players/111/transfer-out', {
                seasonId: 1,
                nickname: 'AdminPlayer',
                destState: 'State 500'
            });
            expect(toast.success).toHaveBeenCalledWith('Player transferred out and archived.');
            expect(mockRefreshGlobalData).toHaveBeenCalledWith(true);
        });
    });
});