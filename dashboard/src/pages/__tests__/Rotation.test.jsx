import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Rotation from '../Rotation';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { toast } from 'react-toastify';

// 1. Mock Contexts
vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }));

// 2. Mock API & External Libs
vi.mock('../../api/client', () => ({
    default: { get: vi.fn(), post: vi.fn() }
}));

vi.mock('react-toastify', () => ({
    toast: { success: vi.fn(), error: vi.fn() }
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

vi.mock('../../assets/rewards/index', () => ({
    getRewardIcon: () => 'mock-icon.png'
}));

// 4. Mock Layout
vi.mock('../../components/layout/AdminLayout', () => ({
    default: ({ children }) => <div data-testid="admin-layout">{children}</div>
}));

describe('Rotation Component', () => {
    const mockBuildings = [
        { id: 1, type: 'Fortress', internal_id: '1' },
        { id: 2, type: 'Stronghold', internal_id: '1' },
        { id: 3, type: 'Stronghold', internal_id: '2' },
        { id: 4, type: 'Stronghold', internal_id: '3' }, // Extra for conflict testing
    ];

    const mockAlliances = [
        { id: 10, name: '[XYZ] Alpha' },
        { id: 20, name: '[ABC] Bravo' }
    ];

    beforeEach(() => {
        vi.clearAllMocks();

        useAuth.mockReturnValue({ user: { role: 'admin' } });
        useApp.mockReturnValue({ features: { Discord: true } });

        // Intercept specific GET requests
        client.get.mockImplementation((url) => {
            if (url === '/moderator/rotation/buildings') return Promise.resolve({ data: mockBuildings });
            if (url === '/moderator/options') return Promise.resolve({ data: { alliances: mockAlliances } });
            if (url === '/moderator/rotation/seasons') return Promise.resolve({ data: { availableSeasons: [1, 2], liveSeason: 2 } });
            if (url.includes('/moderator/rotation/schedule/2')) {
                // Mocking season 2 schedule: Alliance 10 controls Fortress 1 in Week 1
                return Promise.resolve({ data: [{ buildingId: 1, week: 1, allianceId: 10 }] });
            }
            if (url.includes('/moderator/rotation/schedule/1')) return Promise.resolve({ data: [] });
            if (url.includes('/moderator/rotation/rewards')) return Promise.resolve({ data: [] });
            return Promise.resolve({ data: [] });
        });
    });

    const renderComponent = () => {
        return render(
            <MemoryRouter>
                <Rotation />
            </MemoryRouter>
        );
    };

    it('loads and displays the active season matrix', async () => {
        renderComponent();

        // Loading state first
        expect(screen.getByText('SYNCHRONIZING SEASON MATRIX...')).toBeInTheDocument();

        // Verify UI finishes loading
        expect(await screen.findByText('Season 2 Matrix')).toBeInTheDocument();
        expect(screen.getByText('Status: Active Planning')).toBeInTheDocument();

        // Verify building labels exist
        expect(screen.getByText('Fortress 1')).toBeInTheDocument();

        // Verify the pre-loaded schedule was mapped to the dropdown
        // Week 1, Fortress 1 should have Alliance 10 selected
        const dropdown = screen.getByLabelText('Week 1 Fortress 1');

        // Wrap the check in waitFor so it waits for fetchSchedule() to complete!
        await waitFor(() => {
            expect(dropdown.value).toBe('10');
        });
    });

    it('restricts edits for moderators', async () => {
        useAuth.mockReturnValue({ user: { role: 'moderator' } });
        renderComponent();

        await screen.findByText('Season 2 Matrix');

        expect(screen.getByText('Restricted Access')).toBeInTheDocument();

        const dropdown = screen.getByLabelText('Week 1 Fortress 1');
        expect(dropdown).toBeDisabled();

        // Save button shouldn't exist
        expect(screen.queryByRole('button', { name: /Save/i })).not.toBeInTheDocument();
    });

    it('enforces read-only mode for past seasons', async () => {
        renderComponent();
        await screen.findByText('Season 2 Matrix');

        // Switch to Season 1
        const seasonSelect = screen.getByLabelText('Select Season');
        fireEvent.change(seasonSelect, { target: { value: '1' } });

        expect(await screen.findByText('Season 1 Matrix')).toBeInTheDocument();
        expect(screen.getByText('Status: Archived / Read-Only')).toBeInTheDocument();
        expect(screen.getByText('Season 1 Locked')).toBeInTheDocument();

        const dropdown = screen.getByLabelText('Week 1 Fortress 1');
        expect(dropdown).toBeDisabled();
    });

    it('detects and prevents saving when there is a scheduling conflict', async () => {
        renderComponent();
        await screen.findByText('Season 2 Matrix');

        // The limit for Strongholds is 2 per alliance per week.
        // Let's assign [XYZ] Alpha (ID: 10) to 3 different Strongholds in Week 2.
        const sh1Dropdown = screen.getByLabelText('Week 2 Stronghold 1');
        const sh2Dropdown = screen.getByLabelText('Week 2 Stronghold 2');
        const sh3Dropdown = screen.getByLabelText('Week 2 Stronghold 3');

        fireEvent.change(sh1Dropdown, { target: { value: '10' } });
        fireEvent.change(sh2Dropdown, { target: { value: '10' } });
        fireEvent.change(sh3Dropdown, { target: { value: '10' } });

        // Try to save
        const saveButton = screen.getByRole('button', { name: /Save Season 2/i });
        fireEvent.click(saveButton);

        // It should block the request
        expect(client.post).not.toHaveBeenCalled();
        expect(toast.error).toHaveBeenCalledWith('Cannot save: Detected alliance scheduling conflicts.');
    });

    it('successfully saves a valid schedule without conflicts', async () => {
        client.post.mockResolvedValueOnce({});
        renderComponent();

        await screen.findByText('Season 2 Matrix');

        // Make a valid assignment
        const sh1Dropdown = screen.getByLabelText('Week 2 Stronghold 1');
        fireEvent.change(sh1Dropdown, { target: { value: '20' } }); // Assign [ABC] Bravo

        const saveButton = screen.getByRole('button', { name: /Save Season 2/i });
        fireEvent.click(saveButton);

        await waitFor(() => {
            // Check that client.post was called with the correct data shape
            expect(client.post).toHaveBeenCalledWith('/moderator/rotation/save', expect.objectContaining({
                seasonId: 2,
                entries: expect.arrayContaining([
                    { seasonId: 2, week: 1, buildingId: 1, allianceId: 10 }, // Original mock data
                    { seasonId: 2, week: 2, buildingId: 2, allianceId: 20 }  // Our newly mapped data
                ])
            }));
            expect(toast.success).toHaveBeenCalledWith('Season 2 plan saved!');
        });
    });

    it('triggers the discord announcement for a specific week', async () => {
        mockExecuteAnnounce.mockResolvedValueOnce();
        renderComponent();

        await screen.findByText('Season 2 Matrix');

        // Find the announce button for Week 3.
        // Since there are multiple "Week 3" texts, we use getByTitle
        const announceButton = screen.getByTitle('Announce Week 3');
        fireEvent.click(announceButton);

        await waitFor(() => {
            expect(mockExecuteAnnounce).toHaveBeenCalledWith(3);
            expect(toast.success).toHaveBeenCalledWith('Week 3 schedule sent to Discord!');
        });
    });
});