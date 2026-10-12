import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TransferManager from '../TransferManager';
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
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

// 3. Mock Layout
vi.mock('../../components/layout/AdminLayout', () => ({
    default: ({ children }) => <div data-testid="admin-layout">{children}</div>,
}));

describe('TransferManager Component', () => {
    const mockAlliances = [
        { id: 10, name: '[XYZ] Alpha' },
        { id: 20, name: '[ABC] Bravo' },
    ];

    const mockActiveSeason = {
        id: 1,
        name: 'Season Alpha',
        powerCap: 300000000,
        isLeading: false,
        specialInvitesAvailable: 2,
        normalInvitesAvailable: 35,
        status: 'Active',
    };

    const mockCandidates = [
        {
            id: 101,
            seasonId: 1,
            fid: 99901,
            direction: 'Inbound',
            nickname: 'IncomingWarrior',
            furnaceLevel: 30,
            power: 250000000,
            sourceState: 'State 500',
            targetAllianceId: null,
            inviteType: 'None',
            status: 'Pending',
        },
        {
            id: 102,
            seasonId: 1,
            fid: 99902,
            direction: 'Outbound',
            nickname: 'LeavingPlayer',
            furnaceLevel: 28,
            power: 180000000,
            sourceState: 'State 500',
            targetAllianceId: 10,
            inviteType: 'None',
            status: 'Confirmed',
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);

        useApp.mockReturnValue({
            alliances: mockAlliances,
            refreshGlobalData: mockRefreshGlobalData,
        });

        client.get.mockImplementation((url) => {
            if (url === '/moderator/transfers/active') {
                return Promise.resolve({
                    data: {
                        season: mockActiveSeason,
                        records: mockCandidates,
                    },
                });
            }
            return Promise.resolve({ data: {} });
        });
    });

    it('allows a Moderator to see the Add button and draft an inbound candidate', async () => {
        useAuth.mockReturnValue({
            user: { role: 'moderator', username: 'ModUser', allianceId: 10 },
        });

        render(<TransferManager />);

        // Should load the active season
        expect((await screen.findAllByText(/IncomingWarrior/i)).length).toBeGreaterThan(0);

        // The "Add" button should be present for Moderator
        const addButton = screen.getByRole('button', { name: /^add$/i });
        expect(addButton).toBeInTheDocument();

        fireEvent.click(addButton);

        // Modal should open
        expect(screen.getByText('Draft Candidate')).toBeInTheDocument();

        // Fill out modal inputs
        fireEvent.change(screen.getByPlaceholderText('12345678'), { target: { value: '12345' } });
        fireEvent.change(screen.getByPlaceholderText('IceWarrior'), { target: { value: 'NewRecruit' } });
        fireEvent.change(screen.getByPlaceholderText('State 391'), { target: { value: 'State 400' } });

        client.post.mockResolvedValueOnce({ data: { message: 'Successfully added' } });

        const submitAddBtn = screen.getByRole('button', { name: /add player/i });
        fireEvent.click(submitAddBtn);

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/transfers/bulk-add', expect.objectContaining({
                fid: 12345,
                nickname: 'NewRecruit',
                sourceState: 'State 400',
            }));
            expect(toast.success).toHaveBeenCalledWith('Candidate added!');
        });
    });

    it('enables target alliance, power editing, and invite toggles for a Moderator', async () => {
        useAuth.mockReturnValue({
            user: { role: 'moderator', username: 'ModUser', allianceId: 10 },
        });

        render(<TransferManager />);

        expect((await screen.findAllByText(/IncomingWarrior/i)).length).toBeGreaterThan(0);

        // Find the target alliance dropdown for candidate 101
        const selects = screen.getAllByRole('combobox');
        const candidateAllianceSelect = selects.find(s => s.value === '');
        expect(candidateAllianceSelect).not.toBeDisabled();

        client.put.mockResolvedValueOnce({ data: { message: 'Updated' } });

        // Change target alliance
        fireEvent.change(candidateAllianceSelect, { target: { value: '10' } });

        await waitFor(() => {
            expect(client.put).toHaveBeenCalledWith('/moderator/transfers/101', expect.objectContaining({
                targetAllianceId: 10,
            }));
        });

        // Toggle invite type (Norm)
        const normButton = screen.getAllByRole('button', { name: 'Norm' })[0];
        expect(normButton).not.toBeDisabled();

        client.put.mockResolvedValueOnce({ data: { message: 'Updated' } });
        fireEvent.click(normButton);

        await waitFor(() => {
            expect(client.put).toHaveBeenCalledWith('/moderator/transfers/101', expect.objectContaining({
                inviteType: 'Normal',
            }));
        });
    });

    it('allows a Moderator to accept (confirm inbound) and reject pending candidates', async () => {
        useAuth.mockReturnValue({
            user: { role: 'moderator', username: 'ModUser', allianceId: 10 },
        });

        // Seed with a candidate that already has a target alliance selected
        const candidateWithAlliance = [
            {
                ...mockCandidates[0],
                targetAllianceId: 10,
            },
        ];

        client.get.mockImplementation((url) => {
            if (url === '/moderator/transfers/active') {
                return Promise.resolve({
                    data: {
                        season: mockActiveSeason,
                        records: candidateWithAlliance,
                    },
                });
            }
            return Promise.resolve({ data: {} });
        });

        render(<TransferManager />);

        expect((await screen.findAllByText(/IncomingWarrior/i)).length).toBeGreaterThan(0);

        // The Accept button should be present
        const acceptBtn = screen.getByTitle('Accept & Add to Roster');
        expect(acceptBtn).toBeInTheDocument();

        client.post.mockResolvedValueOnce({ data: { message: 'Confirmed' } });
        fireEvent.click(acceptBtn);

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/transfers/101/confirm-inbound', expect.objectContaining({
                fid: 99901,
                nickname: 'IncomingWarrior',
                targetAllianceId: 10,
            }));
            expect(toast.success).toHaveBeenCalledWith('Player Confirmed and added to Roster!');
        });

        // Test Reject button
        const rejectBtn = screen.getByTitle('Reject');
        expect(rejectBtn).toBeInTheDocument();

        client.put.mockResolvedValueOnce({ data: { message: 'Updated' } });
        fireEvent.click(rejectBtn);

        await waitFor(() => {
            expect(client.put).toHaveBeenCalledWith('/moderator/transfers/101', expect.objectContaining({
                status: 'Declined',
            }));
        });
    });

    it('hides season administrative actions (Open, Edit, Close) from Moderators', async () => {
        useAuth.mockReturnValue({
            user: { role: 'moderator', username: 'ModUser', allianceId: 10 },
        });

        // Planning mode season
        client.get.mockImplementation((url) => {
            if (url === '/moderator/transfers/active') {
                return Promise.resolve({
                    data: {
                        season: { ...mockActiveSeason, status: 'Planning' },
                        records: [],
                    },
                });
            }
            return Promise.resolve({ data: {} });
        });

        render(<TransferManager />);

        await screen.findByText(/Planning Mode/i);

        // Moderator should NOT see Open, Edit, or Close buttons
        expect(screen.queryByRole('button', { name: /open/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();

        // But Moderator DOES see Add button
        expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument();
    });

    it('shows season administrative actions (Open, Edit, Close) to Admins', async () => {
        useAuth.mockReturnValue({
            user: { role: 'admin', username: 'AdminUser' },
        });

        client.get.mockImplementation((url) => {
            if (url === '/moderator/transfers/active') {
                return Promise.resolve({
                    data: {
                        season: { ...mockActiveSeason, status: 'Planning' },
                        records: [],
                    },
                });
            }
            return Promise.resolve({ data: {} });
        });

        render(<TransferManager />);

        await screen.findByText(/Planning Mode/i);

        // Admin SHOULD see Open, Edit, and Close buttons
        expect(screen.getByRole('button', { name: /open/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });
});
