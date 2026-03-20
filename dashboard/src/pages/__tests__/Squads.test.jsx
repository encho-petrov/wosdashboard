import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Squads from '../Squads';
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
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }
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

// 4. Mock Rate Limiter for Announce
const mockExecuteAnnounce = vi.fn();
vi.mock('../../hooks/useRateLimit', () => ({
    useRateLimit: () => ({
        execute: mockExecuteAnnounce,
        isPending: false,
        cooldown: 0
    })
}));

describe('Squads Component', () => {
    const originalConfirm = window.confirm;
    const mockUser = { role: 'admin' };
    const mockRefreshGlobalData = vi.fn();

    const mockRoster = [
        { fid: 1, nickname: 'UnassignedSoldier', fightingAllianceId: 101, teamId: null, power: 100 },
        { fid: 2, nickname: 'SquadCaptain', fightingAllianceId: 101, teamId: 1, power: 500 },
        { fid: 3, nickname: 'SquadMember', fightingAllianceId: 101, teamId: 1, power: 200 },
        { fid: 4, nickname: 'OtherAlliancePlayer', fightingAllianceId: 999, teamId: null, power: 100 }
    ];

    const mockAlliances = {
        alliances: [
            { id: 101, name: 'Alpha Alliance' }
        ]
    };

    const mockSquads = [
        { id: 1, captainFid: 2, totalPower: 700 }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);

        useAuth.mockReturnValue({ user: mockUser });
        useApp.mockReturnValue({
            roster: mockRoster,
            globalLoading: false,
            refreshGlobalData: mockRefreshGlobalData,
            features: { Discord: true }
        });

        client.get.mockImplementation((url) => {
            if (url.includes('/war-room/stats')) return Promise.resolve({ data: mockAlliances });
            if (url.includes('/squads/101')) return Promise.resolve({ data: mockSquads });
            return Promise.resolve({ data: [] });
        });
    });

    afterEach(() => {
        window.confirm = originalConfirm;
    });

    const renderComponent = () => render(
        <MemoryRouter>
            <Squads />
        </MemoryRouter>
    );

    it('renders alliances, squads, and unassigned players', async () => {
        renderComponent();

        // Verify Alliance loads
        expect(await screen.findByText('Alpha Alliance')).toBeInTheDocument();

        // Verify Unassigned player is in the sidebar (infantry)
        expect(screen.getByText('UnassignedSoldier')).toBeInTheDocument();

        // Verify OtherAlliancePlayer is filtered out
        expect(screen.queryByText('OtherAlliancePlayer')).not.toBeInTheDocument();

        // Verify Squad Captain and Member render in the main grid
        expect(screen.getByText('SquadCaptain')).toBeInTheDocument();
        expect(screen.getByText('SquadMember')).toBeInTheDocument();
    });

    it('promotes an unassigned player to captain (creates a squad)', async () => {
        client.post.mockResolvedValueOnce({});
        renderComponent();
        await screen.findByText('UnassignedSoldier');

        // Click the crown icon next to UnassignedSoldier
        const promoteBtn = screen.getByLabelText('Promote UnassignedSoldier');
        fireEvent.click(promoteBtn);

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/squads/promote', {
                fid: 1,
                allianceId: 101
            });
            expect(toast.success).toHaveBeenCalledWith('Squad created!');
            expect(mockRefreshGlobalData).toHaveBeenCalled();
        });
    });

    it('assigns an unassigned player to an existing squad', async () => {
        client.post.mockResolvedValueOnce({});
        renderComponent();
        await screen.findByText('UnassignedSoldier');

        // 1. Click the unassigned player to select them
        fireEvent.click(screen.getByText('UnassignedSoldier'));

        // 2. Click the squad card (dropzone) to assign them
        const squadCard = screen.getByTestId('squad-card-1');
        fireEvent.click(squadCard);

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/squads/assign', {
                fid: 1,
                teamId: 1
            });
            expect(mockRefreshGlobalData).toHaveBeenCalled();
        });
    });

    it('removes a player from a squad', async () => {
        client.post.mockResolvedValueOnce({});
        renderComponent();
        await screen.findByText('SquadMember');

        // Click the X button next to SquadMember
        const removeBtn = screen.getByLabelText('Remove SquadMember');
        fireEvent.click(removeBtn);

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/squads/assign', {
                fid: 3,
                teamId: null
            });
            expect(mockRefreshGlobalData).toHaveBeenCalled();
        });
    });

    it('demotes a captain and disbands the squad', async () => {
        client.post.mockResolvedValueOnce({});
        renderComponent();
        await screen.findByText('SquadCaptain');

        // Click the trash icon in the squad header
        const disbandBtn = screen.getByLabelText('Disband Squad');
        fireEvent.click(disbandBtn);

        expect(window.confirm).toHaveBeenCalledWith('Disband this squad?');

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/squads/demote', {
                teamId: 1
            });
            expect(toast.info).toHaveBeenCalledWith('Squad disbanded');
            expect(mockRefreshGlobalData).toHaveBeenCalled();
        });
    });

    it('announces squads to discord', async () => {
        mockExecuteAnnounce.mockResolvedValueOnce({});
        renderComponent();
        await screen.findByText('SquadCaptain');

        const announceBtn = screen.getByRole('button', { name: /Announce/i });
        fireEvent.click(announceBtn);

        await waitFor(() => {
            expect(mockExecuteAnnounce).toHaveBeenCalledWith(expect.objectContaining({
                title: "🛡️ Squad Assignments Finalized",
                description: expect.stringContaining('Alpha Alliance')
            }));
            expect(toast.success).toHaveBeenCalledWith('Squads for Alpha Alliance announced!');
        });
    });
});