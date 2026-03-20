import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import WarRoomHistory from '../EventHistory';
import client from '../../api/client';
import { useApp } from '../../context/AppContext';
import { toast } from 'react-toastify';

// 1. Mock Contexts
vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('react-toastify', () => ({
    toast: { error: vi.fn() }
}));

// 2. Mock API
vi.mock('../../api/client', () => ({
    default: { get: vi.fn() }
}));

// 3. Mock Layout
vi.mock('../../components/layout/AdminLayout', () => ({
    default: ({ children, title }) => (
        <div data-testid="admin-layout">
            <h1>{title}</h1>
            {children}
        </div>
    )
}));

describe('EventHistory Component', () => {
    const mockAlliances = [
        { id: 101, name: 'Alpha Alliance' },
        { id: 102, name: 'Beta Alliance' }
    ];

    const mockHistoryTimeline = [
        { id: 1, notes: 'SvS Victory', eventDate: '2026-03-10T12:00:00Z', createdBy: 'AdminOne' },
        { id: 2, notes: 'Tyrant Defense', eventDate: '2026-03-15T12:00:00Z', createdBy: 'AdminTwo' }
    ];

    const mockSnapshot1 = {
        players: [
            { id: 10, playerId: 1001, nickname: 'AlphaLead', fightingAllianceId: 101, allianceId: 101, teamId: 50 },
            { id: 11, playerId: 1002, nickname: 'AlphaJoiner', fightingAllianceId: 101, allianceId: 102, teamId: 50 },
            { id: 12, playerId: 1003, nickname: 'SoloFighter', fightingAllianceId: 101, allianceId: null, teamId: null }
        ],
        teams: [
            { id: 1, originalTeamId: 50, name: 'Strike Team A', fightingAllianceId: 101, captainFid: 1001 }
        ]
    };

    const mockSnapshot2 = {
        players: [],
        teams: []
    };

    beforeEach(() => {
        vi.clearAllMocks();

        useApp.mockReturnValue({ alliances: mockAlliances });

        client.get.mockImplementation((url) => {
            if (url === '/moderator/war-room/history') {
                return Promise.resolve({ data: mockHistoryTimeline });
            }
            if (url === '/moderator/war-room/history/1') {
                return Promise.resolve({ data: mockSnapshot1 });
            }
            if (url === '/moderator/war-room/history/2') {
                return Promise.resolve({ data: mockSnapshot2 });
            }
            return Promise.resolve({ data: {} });
        });
    });

    const renderComponent = () => render(
        <MemoryRouter>
            <WarRoomHistory />
        </MemoryRouter>
    );

    it('loads the timeline and auto-selects the first event', async () => {
        renderComponent();

        // The title renders in both mobile and desktop views, so we use findAllByText
        const svsEvents = await screen.findAllByText('SvS Victory');
        expect(svsEvents.length).toBeGreaterThan(0);

        const tyrantEvents = await screen.findAllByText('Tyrant Defense');
        expect(tyrantEvents.length).toBeGreaterThan(0);

        expect(screen.getByText('Archived by: AdminOne')).toBeInTheDocument();

        // Use a function matcher to find the specific Alliance header since the name repeats
        expect(await screen.findByText((content, element) => {
            return element.tagName.toLowerCase() === 'h2' && content.includes('Alpha Alliance');
        })).toBeInTheDocument();

        // Verify total roster rendered (AlphaLead appears twice: in roster AND in squad)
        expect(screen.getAllByText('AlphaLead').length).toBeGreaterThan(0);
        expect(screen.getByText('SoloFighter')).toBeInTheDocument();

        // Verify squad deployment rendered
        expect(screen.getByText('Strike Team A')).toBeInTheDocument();
        // It should match the captain's nickname based on captainFid
        expect(screen.getByText('Captain: AlphaLead')).toBeInTheDocument();

        // Use getAllByText because AlphaJoiner's base tag appears in both the roster list AND the squad list
        expect(screen.getAllByText('[Beta Alliance]').length).toBeGreaterThan(0);
    });

    it('allows clicking a different timeline event to load its snapshot', async () => {
        renderComponent();

        // Wait for initial load
        const svsEvents = await screen.findAllByText('SvS Victory');
        expect(svsEvents.length).toBeGreaterThan(0);

        // Click the second event from the sidebar list (we'll just grab the first instance found)
        const tyrantEvents = await screen.findAllByText('Tyrant Defense');
        fireEvent.click(tyrantEvents[0]); // Click the first instance

        await waitFor(() => {
            expect(client.get).toHaveBeenCalledWith('/moderator/war-room/history/2');
        });
    });

    it('handles empty timeline state gracefully', async () => {
        client.get.mockResolvedValueOnce({ data: [] }); // Return empty history

        renderComponent();

        expect(await screen.findByText('No archived events found.')).toBeInTheDocument();
        expect(screen.getByText('Select an event from the timeline.')).toBeInTheDocument();
    });

    it('handles API failure for timeline gracefully', async () => {
        client.get.mockRejectedValueOnce(new Error('Network error'));

        renderComponent();

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('Failed to load history timeline.');
        });
        expect(screen.getByText('Select an event from the timeline.')).toBeInTheDocument();
    });
});