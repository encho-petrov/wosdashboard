import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Foundry from '../Foundry';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { toast } from 'react-toastify';

// 1. Mock Contexts
vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }));

// 2. Mock API & Toastify
vi.mock('../../api/client', () => ({
    default: { get: vi.fn(), post: vi.fn() }
}));

vi.mock('react-toastify', () => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
}));

// 3. Mock Custom Hook and Assets
const mockExecuteAnnounce = vi.fn();
vi.mock('../../hooks/useRateLimit', () => ({
    useRateLimit: () => ({
        execute: mockExecuteAnnounce,
        isPending: false,
        cooldown: 0
    })
}));

// 4. Mock Power Formatter so it doesn't break
vi.mock('../../components/FormatPower.jsx', () => ({
    default: (val) => `${val} PWR`
}));

// 5. Mock Layout to render header actions
vi.mock('../../components/layout/AdminLayout', () => ({
    default: ({ children, title, actions }) => (
        <div data-testid="admin-layout">
            <h1 data-testid="layout-title">{title}</h1>
            <div data-testid="layout-actions">{actions}</div>
            {children}
        </div>
    )
}));

describe('Foundry Component (AllianceWarRoom)', () => {
    const originalConfirm = window.confirm;
    const originalPrompt = window.prompt;

    const mockUser = { role: 'admin', allianceId: 99 };

    const mockRoster = [
        { playerId: 1, nickname: 'BenchPlayer1', power: 1000, allianceId: 99 },
        { playerId: 2, nickname: 'DeployedPlayer1', power: 2000, allianceId: 99 },
        { playerId: 3, nickname: 'OtherAlliancePlayer', power: 3000, allianceId: 44 } // Should be filtered out
    ];

    const mockLiveState = {
        legions: [{ legionId: 1, isLocked: false }, { legionId: 2, isLocked: true }],
        roster: [{ fid: 2, legionId: 1, isSub: false, attendance: 'Pending' }], // DeployedPlayer1 is in Legion 1
        stats: [{ playerId: 2, score: 85 }] // DeployedPlayer1 has 85% attendance
    };

    const mockHistoryList = [
        { id: 101, notes: 'Vs Server 123', eventDate: '2026-03-10T00:00:00Z' }
    ];

    const mockHistorySnapshot = [
        { fid: 2, nickname: 'DeployedPlayer1', legionId: 1, isSub: false, attendance: 'Attended' }
    ];

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock window dialogs
        window.confirm = vi.fn(() => true);
        window.prompt = vi.fn(() => "Test Archive Name");

        useAuth.mockReturnValue({ user: mockUser });
        useApp.mockReturnValue({ roster: mockRoster, globalLoading: false, features: { Discord: true } });

        client.get.mockImplementation((url) => {
            if (url.includes('/moderator/foundry/state')) return Promise.resolve({ data: mockLiveState });
            if (url.includes('/moderator/foundry/history?')) return Promise.resolve({ data: mockHistoryList });
            if (url.includes('/moderator/foundry/history/101')) return Promise.resolve({ data: mockHistorySnapshot });
            return Promise.resolve({ data: {} });
        });
    });

    afterEach(() => {
        window.confirm = originalConfirm;
        window.prompt = originalPrompt;
    });

    const renderComponent = () => render(
        <MemoryRouter>
            <Foundry />
        </MemoryRouter>
    );

    it('renders the live board, bench, and deployed players', async () => {
        renderComponent();

        expect(await screen.findByText('Alliance Events')).toBeInTheDocument();

        // Verify bench player is in the bench list (and formatted power works)
        expect(screen.getByText('BenchPlayer1')).toBeInTheDocument();
        expect(screen.getByText('1000 PWR')).toBeInTheDocument();

        // Verify OtherAlliancePlayer is filtered out
        expect(screen.queryByText('OtherAlliancePlayer')).not.toBeInTheDocument();

        // Verify deployed player is in Legion 1 (and shows attendance percentage)
        expect(screen.getByText('DeployedPlayer1')).toBeInTheDocument();
        expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('allows deploying a player from the bench via mobile selection flow', async () => {
        client.post.mockResolvedValueOnce({});
        renderComponent();
        await screen.findByText('BenchPlayer1');

        // Click the bench player to open the mobile deploy menu
        fireEvent.click(screen.getByText('BenchPlayer1'));

        // Wait for popup menu to appear and click "Legion 2 (Act)"
        const deployBtn = await screen.findByRole('button', { name: /Legion 2 \(Act\)/i });
        fireEvent.click(deployBtn);

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/foundry/deploy', {
                eventType: 'Foundry',
                playerId: 1,
                legionId: 2,
                isSub: false
            });
        });
    });

    it('allows removing a deployed player', async () => {
        client.post.mockResolvedValueOnce({});
        renderComponent();
        await screen.findByText('DeployedPlayer1');

        // Legion 1 is unlocked, so the remove button should be present for DeployedPlayer1
        const removeBtn = screen.getByLabelText('Remove DeployedPlayer1');
        fireEvent.click(removeBtn);

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/foundry/deploy', {
                eventType: 'Foundry',
                playerId: 2,
                legionId: null,
                isSub: false // value doesn't matter for removal, but checks payload
            });
        });
    });

    it('allows locking a legion and sending a discord announcement', async () => {
        client.post.mockResolvedValueOnce({});
        mockExecuteAnnounce.mockResolvedValueOnce({});

        renderComponent();
        await screen.findByText('Legion 1');

        // Lock Legion 1
        const lockBtn = screen.getByLabelText('Lock Legion 1');
        fireEvent.click(lockBtn);

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/foundry/lock', {
                eventType: 'Foundry',
                legionId: 1,
                isLocked: true
            });
        });

        // Since we just locked Legion 1, [0] will grab Legion 1's announce button!
        const announceBtn = screen.getAllByTitle('Announce to Discord')[0];
        fireEvent.click(announceBtn);

        await waitFor(() => {
            expect(mockExecuteAnnounce).toHaveBeenCalledWith(expect.objectContaining({
                eventName: 'Foundry',
                // Update this to expect Legion 1
                message: expect.stringContaining('Legion 1')
            }));
            expect(toast.success).toHaveBeenCalledWith('Legion 1 announced to Discord!');
        });
    });

    it('archives and resets the board', async () => {
        client.post.mockResolvedValueOnce({});
        renderComponent();
        await screen.findByText('Alliance Events');

        // Click Reset
        const resetBtn = screen.getByRole('button', { name: /Reset/i });
        fireEvent.click(resetBtn);

        // Verifies confirm and prompt were called
        expect(window.confirm).toHaveBeenCalledWith('Archive and reset the Foundry board?');
        expect(window.prompt).toHaveBeenCalledWith("Name this event for history (e.g., 'Vs Alliance XYZ'):");

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/foundry/reset', {
                eventType: 'Foundry',
                notes: 'Test Archive Name'
            });
            expect(toast.success).toHaveBeenCalledWith('Event archived!');
        });
    });

    it('toggles to history mode and loads snapshot', async () => {
        renderComponent();
        await screen.findByText('Alliance Events');

        // Switch to Archives
        const archiveBtn = screen.getByRole('button', { name: /Archives/i });
        fireEvent.click(archiveBtn);

        await waitFor(() => {
            // It should fetch the list
            expect(client.get).toHaveBeenCalledWith(expect.stringContaining('/moderator/foundry/history?eventType=Foundry'));
            // And automatically fetch the first snapshot ID (101)
            expect(client.get).toHaveBeenCalledWith('/moderator/foundry/history/101');
        });

        // Verify history data is rendered. Use findAllByText because it renders on both Mobile and Desktop views!
        const historyTitles = await screen.findAllByText('Vs Server 123');
        expect(historyTitles.length).toBeGreaterThan(0);

        // DeployedPlayer1 in history has "Attended" status
        const attendedBadge = await screen.findAllByText('Attended');
        expect(attendedBadge.length).toBeGreaterThan(0);
    });
});