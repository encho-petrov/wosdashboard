import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import WarRoom from '../WarRoom';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { toast } from 'react-toastify';
import {act} from "react";

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

// 3. Mock Rate Limiter
const mockExecuteAnnounce = vi.fn();
vi.mock('../../hooks/useRateLimit', () => ({
    useRateLimit: () => ({
        execute: mockExecuteAnnounce,
        isPending: false,
        cooldown: 0
    })
}));

// 4. Mock Formatters & Layouts
vi.mock('../../components/FormatPower.jsx', () => ({
    default: (val) => `${val} PWR`
}));

vi.mock('../../components/layout/AdminLayout', () => ({
    default: ({ children, title, actions }) => (
        <div data-testid="admin-layout">
            <h1 data-testid="layout-title">{title}</h1>
            <div data-testid="layout-actions">{actions}</div>
            {children}
        </div>
    )
}));

describe('WarRoom Component', () => {
    const mockUser = { role: 'admin' };
    const mockRefreshGlobalData = vi.fn();

    const mockRoster = [
        { fid: 1, nickname: 'BenchPlayer', normalPower: 100, power: 150, fightingAllianceId: null },
        { fid: 2, nickname: 'DeployedPlayer', normalPower: 200, power: 250, fightingAllianceId: 101 }
    ];

    const mockStatsUninitialized = { alliances: [], eventType: '' };
    const mockStatsInitialized = {
        eventType: 'SvS',
        alliances: [
            { id: 101, name: 'Alpha Alliance', isLocked: false },
            { id: 102, name: 'Beta Alliance', isLocked: true }
        ]
    };

    const mockFilters = { troopTypes: ['Infantry'], battleAvailability: ['Yes'], tundraAvailability: [] };

    beforeEach(() => {
        vi.clearAllMocks();

        useAuth.mockReturnValue({ user: mockUser });
        useApp.mockReturnValue({
            roster: mockRoster,
            globalLoading: false,
            refreshGlobalData: mockRefreshGlobalData,
            features: { Discord: true }
        });

        // Default API responses
        client.get.mockImplementation((url) => {
            if (url.includes('/stats')) return Promise.resolve({ data: mockStatsUninitialized });
            if (url.includes('/filters')) return Promise.resolve({ data: mockFilters });
            if (url.includes('/attendance-stats')) return Promise.resolve({ data: [{ fid: 2, score: 95 }] });
            return Promise.resolve({ data: {} });
        });
    });

    const renderComponent = () => render(
        <MemoryRouter>
            <WarRoom />
        </MemoryRouter>
    );

    it('renders the initialization modal if no event is active', async () => {
        renderComponent();

        expect(await screen.findByText('Initialize Session')).toBeInTheDocument();

        // Test starting a session
        client.post.mockResolvedValueOnce({});
        const svsBtn = screen.getByRole('button', { name: 'SvS' });
        fireEvent.click(svsBtn);

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/war-room/session', { eventType: 'SvS' });
            expect(toast.success).toHaveBeenCalledWith('Started global session for SvS!');
        });
    });

    it('renders the live board when an event is active', async () => {
        client.get.mockImplementation((url) => {
            if (url.includes('/stats')) return Promise.resolve({ data: mockStatsInitialized });
            if (url.includes('/filters')) return Promise.resolve({ data: mockFilters });
            return Promise.resolve({ data: {} });
        });

        renderComponent();

        // Verify bench player
        expect(await screen.findByText('BenchPlayer')).toBeInTheDocument();

        // Verify deployed player is inside Alpha Alliance
        expect(screen.getByText('Alpha Alliance')).toBeInTheDocument();
        expect(screen.getByText('DeployedPlayer')).toBeInTheDocument();
    });

    it('allows deploying a player from the bench via click', async () => {
        client.get.mockImplementation((url) => {
            if (url.includes('/stats')) return Promise.resolve({ data: mockStatsInitialized });
            if (url.includes('/filters')) return Promise.resolve({ data: mockFilters });
            return Promise.resolve({ data: {} });
        });
        client.post.mockResolvedValueOnce({});

        renderComponent();
        await screen.findByText('BenchPlayer');

        // 1. Click the bench player
        fireEvent.click(screen.getByText('BenchPlayer'));

        // 2. Click the target alliance dropzone
        const alphaAllianceZone = screen.getByTestId('alliance-dropzone-101');
        fireEvent.click(alphaAllianceZone);

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/war-room/deploy', {
                playerIds: [1],
                allianceId: 101
            });
            expect(mockRefreshGlobalData).toHaveBeenCalled();
        });
    });

    it('allows removing a player from an unlocked alliance', async () => {
        client.get.mockImplementation((url) => {
            if (url.includes('/stats')) return Promise.resolve({ data: mockStatsInitialized });
            if (url.includes('/filters')) return Promise.resolve({ data: mockFilters });
            return Promise.resolve({ data: {} });
        });
        client.post.mockResolvedValueOnce({});

        renderComponent();
        await screen.findByText('DeployedPlayer');

        // Click the X button (we added the aria-label for this!)
        const removeBtn = screen.getByLabelText('Remove DeployedPlayer');
        fireEvent.click(removeBtn);

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/war-room/deploy', {
                playerIds: [2],
                allianceId: null
            });
        });
    });

    it('allows locking an alliance', async () => {
        client.get.mockImplementation((url) => {
            if (url.includes('/stats')) return Promise.resolve({ data: mockStatsInitialized });
            if (url.includes('/filters')) return Promise.resolve({ data: mockFilters });
            return Promise.resolve({ data: {} });
        });
        client.post.mockResolvedValueOnce({});

        renderComponent();
        await screen.findByText('Alpha Alliance');

        // Alpha Alliance starts unlocked
        const lockBtn = screen.getByLabelText('Lock Alpha Alliance');
        fireEvent.click(lockBtn);

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/war-room/lock', {
                allianceId: 101,
                isLocked: true
            });
        });
    });

    it('allows archiving the session', async () => {
        // Override the roster for just this test so there are no pending attendances blocking the archive modal
        useApp.mockReturnValue({
            roster: [{ fid: 1, nickname: 'BenchPlayer', normalPower: 100, power: 150, fightingAllianceId: null }],
            globalLoading: false,
            refreshGlobalData: mockRefreshGlobalData,
            features: { Discord: true }
        });

        client.get.mockImplementation((url) => {
            if (url.includes('/stats')) return Promise.resolve({ data: mockStatsInitialized });
            if (url.includes('/filters')) return Promise.resolve({ data: mockFilters });
            return Promise.resolve({ data: {} });
        });
        client.post.mockResolvedValueOnce({});

        renderComponent();
        await screen.findByText('Alpha Alliance');

        // This will pass the attendance check and open the modal
        const archiveBtn = screen.getByRole('button', { name: /Archive & Reset/i });
        fireEvent.click(archiveBtn);

        // Modal should appear
        expect(await screen.findByText('Archive Session')).toBeInTheDocument();

        // Type a name
        const nameInput = screen.getByPlaceholderText('e.g. Vs State 390');
        fireEvent.change(nameInput, { target: { value: 'Test Archive 123' } });

        // Confirm
        const confirmBtn = screen.getByRole('button', { name: 'Confirm' });
        fireEvent.click(confirmBtn);

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/war-room/reset', expect.objectContaining({
                eventType: 'SvS',
                notes: 'Test Archive 123'
            }));
            expect(toast.success).toHaveBeenCalledWith('Event archived and board wiped!');
        });
    });

    it('listens for REFRESH_WARROOM SSE event and triggers data refresh', async () => {
        // Set up initial state with an active event so the main board renders
        client.get.mockImplementation((url) => {
            if (url.includes('/stats')) return Promise.resolve({ data: mockStatsInitialized });
            if (url.includes('/filters')) return Promise.resolve({ data: mockFilters });
            return Promise.resolve({ data: {} });
        });

        renderComponent();

        // 1. Wait for initial mount to finish
        await screen.findByText('Alpha Alliance');

        // 2. Clear call history
        mockRefreshGlobalData.mockClear();
        client.get.mockClear();

        // 3. Dispatch the SSE event
        act(async () => {
            window.dispatchEvent(new Event('REFRESH_WARROOM'));
        });

        // 4. Assert that the component reacted correctly
        await waitFor(() => {
            // It should refresh the global roster
            expect(mockRefreshGlobalData).toHaveBeenCalledWith(true);

            // It should refetch the war room stats and filters
            expect(client.get).toHaveBeenCalledWith('/moderator/war-room/stats');
            expect(client.get).toHaveBeenCalledWith('/moderator/war-room/filters');
        });
    });
});