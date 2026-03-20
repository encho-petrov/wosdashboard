import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import MinistryReservations from '../MinistryReservations';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { toast } from 'react-toastify';

// 1. Mock Contexts
vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }));

// 2. Mock API & Toastify
vi.mock('../../api/client', () => ({
    default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }
}));

vi.mock('react-toastify', () => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
}));

// 3. Mock Layout
vi.mock('../../components/layout/AdminLayout', () => ({
    default: ({ children, title, actions }) => (
        <div data-testid="admin-layout">
            <h1 data-testid="layout-title">{title}</h1>
            <div data-testid="layout-actions">{actions}</div>
            {children}
        </div>
    )
}));

// Helper to generate 48 slots for testing the accordion logic
const generateSlots = (assignedIndex = -1, assignedPlayer = null) => {
    return Array.from({ length: 48 }).map((_, i) => ({
        id: `slot-${i}`,
        slotIndex: i,
        playerFid: i === assignedIndex ? assignedPlayer.fid : null,
        nickname: i === assignedIndex ? assignedPlayer.nickname : null,
        allianceName: i === assignedIndex ? assignedPlayer.allianceName : null
    }));
};

describe('MinistryReservations Component', () => {
    const originalConfirm = window.confirm;

    const mockRoster = [
        { fid: '111', nickname: 'CommanderA', allianceName: '[XYZ] Alpha' },
        { fid: '222', nickname: 'OperatorB', allianceName: '[ABC] Bravo' }
    ];

    const mockActiveEvent = {
        event: { id: 10, title: 'Week of March 16', status: 'Planning', announceEnabled: true },
        schedule: [
            { id: 'day-1', buffName: 'Construction', activeDate: '2026-03-16T00:00:00Z', slots: generateSlots(0, mockRoster[0]) },
            { id: 'day-2', buffName: 'Research', activeDate: '2026-03-17T00:00:00Z', slots: generateSlots() },
            { id: 'day-3', buffName: 'Training', activeDate: '2026-03-19T00:00:00Z', slots: generateSlots() }
        ]
    };

    const mockHistoryList = [
        { id: 9, title: 'Week of March 9', closedAt: '2026-03-15T00:00:00Z' }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);

        useAuth.mockReturnValue({ user: { role: 'admin' } });
        useApp.mockReturnValue({ roster: mockRoster });

        client.get.mockImplementation((url) => {
            if (url === '/moderator/ministry/active') return Promise.resolve({ data: mockActiveEvent });
            if (url === '/moderator/ministry/history') return Promise.resolve({ data: mockHistoryList });
            if (url === '/moderator/ministry/history/9') return Promise.resolve({ data: mockActiveEvent.schedule });
            return Promise.resolve({ data: {} });
        });
    });

    afterEach(() => {
        window.confirm = originalConfirm;
    });

    const renderComponent = () => {
        return render(
            <MemoryRouter>
                <MinistryReservations />
            </MemoryRouter>
        );
    };

    it('renders the active schedule and loaded assigned slots', async () => {
        renderComponent();

        // Verify Header Information
        expect(await screen.findByText('Week of March 16')).toBeInTheDocument();
        expect(screen.getByText('Planning Mode')).toBeInTheDocument();
        expect(screen.getByText('Discord Pings Active')).toBeInTheDocument();

        // Verify Data is rendered (CommanderA is assigned to slot 0)
        const commanderElements = await screen.findAllByText('CommanderA');
        expect(commanderElements.length).toBeGreaterThan(0);
    });

    it('renders the empty state and allows event creation', async () => {
        // Override default mock to return no active event
        client.get.mockResolvedValueOnce({ data: { event: null, schedule: [] } });
        client.post.mockResolvedValueOnce({});

        renderComponent();

        expect(await screen.findByText('No Active Ministry Event')).toBeInTheDocument();

        // Open Modal
        fireEvent.click(screen.getByRole('button', { name: /Draft New Schedule/i }));

        // Fill Base Date (Find it by type="date" instead of the unbound label)
        // We get the first date input in the modal, which is the Base Date.
        const baseDateInput = screen.getAllByDisplayValue('')[0];
        // ^ Wait, it's better to just grab the first date input:
        const allDateInputs = document.querySelectorAll('input[type="date"]');
        fireEvent.change(allDateInputs[0], { target: { value: '2026-03-23' } });

        // Ensure the auto-calculated date correctly populated the inputs
        const constructionDate = screen.getByLabelText('Construction Date');
        expect(constructionDate.value).toBe('2026-03-23');

        // Submit
        fireEvent.click(screen.getByRole('button', { name: /Generate 144 Slots/i }));

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/ministry/events', expect.objectContaining({
                title: 'Ministry: Week of 2026-03-23',
                announceEnabled: true
            }));
            expect(toast.success).toHaveBeenCalledWith('Ministry schedule generated!');
        });
    });

    it('allows reserving a vacant slot via the roster search modal', async () => {
        client.put.mockResolvedValueOnce({});
        renderComponent();
        await screen.findByText('Week of March 16');

        // Find the first "Reserve Slot" button (slot 1)
        const reserveButtons = screen.getAllByRole('button', { name: /Reserve Slot/i });
        fireEvent.click(reserveButtons[0]);

        // Check modal opened
        expect(screen.getByText('Select Operator')).toBeInTheDocument();

        // Search for OperatorB
        const searchInput = screen.getByPlaceholderText('Search Callsign or FID...');
        fireEvent.change(searchInput, { target: { value: 'OperatorB' } });

        // Click OperatorB from results
        const playerRow = await screen.findByText('OperatorB');
        fireEvent.click(playerRow);

        await waitFor(() => {
            // It should call the PUT endpoint for the specific slot ID
            expect(client.put).toHaveBeenCalledWith('/moderator/ministry/slots/slot-1', {
                playerFid: '222',
                nickname: 'OperatorB'
            });
            expect(toast.success).toHaveBeenCalledWith('Player assigned!');
        });
    });

    it('allows clearing an assigned slot', async () => {
        client.put.mockResolvedValueOnce({});
        renderComponent();
        await screen.findByText('Week of March 16');

        // Click the X button to clear CommanderA (who is in slot-0)
        const clearButton = screen.getByLabelText('Clear slot');
        fireEvent.click(clearButton);

        await waitFor(() => {
            expect(client.put).toHaveBeenCalledWith('/moderator/ministry/slots/slot-0', {
                playerFid: null,
                nickname: 'CommanderA'
            });
            expect(toast.success).toHaveBeenCalledWith('Slot cleared');
        });
    });

    it('allows toggling discord announcements and advancing event status', async () => {
        client.put.mockResolvedValue({});
        renderComponent();
        await screen.findByText('Week of March 16');

        // Toggle Discord Pings
        const pingButton = screen.getByText('Discord Pings Active');
        fireEvent.click(pingButton);

        await waitFor(() => {
            // ID 10 is our mocked event ID
            expect(client.put).toHaveBeenCalledWith('/moderator/ministry/events/10/announce', {
                announceEnabled: false // Reversing the current state
            });
            expect(toast.success).toHaveBeenCalledWith('Discord Pings turned OFF');
        });

        // Advance Status to 'Active'
        const startButton = screen.getByRole('button', { name: /Start/i });
        fireEvent.click(startButton);

        expect(window.confirm).toHaveBeenCalledWith('Start the execution phase? Discord pings will begin.');

        await waitFor(() => {
            expect(client.put).toHaveBeenCalledWith('/moderator/ministry/events/10/status', {
                status: 'Active'
            });
            expect(toast.success).toHaveBeenCalledWith('Event moved to Active');
        });
    });

    it('loads and views historical events', async () => {
        renderComponent();
        await screen.findByText('Week of March 16');

        // Click View History
        const historyButton = screen.getByRole('button', { name: /History/i });
        fireEvent.click(historyButton);

        // It should fetch history list and automatically load the first one (ID: 9)
        await waitFor(() => {
            expect(client.get).toHaveBeenCalledWith('/moderator/ministry/history');
            expect(client.get).toHaveBeenCalledWith('/moderator/ministry/history/9');
        });

        // The archive title should appear in the header
        expect(await screen.findByText('Archive: Week of March 9')).toBeInTheDocument();

        // Active Board button should appear to exit history
        const exitButton = screen.getByRole('button', { name: /Active Board/i });
        fireEvent.click(exitButton);

        // Should fetch the active board again
        await waitFor(() => {
            expect(client.get).toHaveBeenCalledWith('/moderator/ministry/active');
        });
    });
});