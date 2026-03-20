import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Strategy from '../StrategyMeta';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { toast } from 'react-toastify';

// 1. Mock Contexts & Utils
vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('react-toastify', () => ({
    toast: { success: vi.fn(), error: vi.fn() }
}));

// 2. Mock API
vi.mock('../../api/client', () => ({
    default: { get: vi.fn(), post: vi.fn() },
    API_URL: 'http://localhost:3000'
}));

// 3. Mock Rate Limiter
const mockExecuteNotify = vi.fn();
vi.mock('../../hooks/useRateLimit', () => ({
    useRateLimit: () => ({
        execute: mockExecuteNotify,
        isPending: false,
        cooldown: 0
    })
}));

// 4. Mock HTML2Canvas
vi.mock('html2canvas', () => ({
    default: vi.fn().mockResolvedValue({
        toBlob: (callback) => {
            callback(new Blob(['fake-image-data'], { type: 'image/png' }));
        }
    })
}));

// 5. Mock Asset Imports
vi.mock('../../assets/maps/svs.png', () => ({ default: 'svs.png' }));
vi.mock('../../assets/maps/tyrant.webp', () => ({ default: 'tyrant.webp' }));
vi.mock('../../assets/maps/foundry.png', () => ({ default: 'foundry.png' }));

// 6. Mock Admin Layout
vi.mock('../../components/layout/AdminLayout', () => ({
    default: ({ children, title }) => (
        <div data-testid="admin-layout">
            <h1>{title}</h1>
            {children}
        </div>
    )
}));

describe('Strategy Component', () => {
    const mockUser = { role: 'admin' };

    const mockHeroes = [
        { id: 1, name: 'Greg', troopType: 'Infantry', localImagePath: '/img/greg.png' },
        { id: 2, name: 'Alonso', troopType: 'Lancer', localImagePath: '/img/alonso.png' }
    ];

    const mockCaptains = [
        { fid: 100, nickname: 'CapOne', avatarImage: '/img/cap1.png', allianceName: 'Alpha' }
    ];

    const mockActiveMeta = {
        attack: {
            infantryRatio: 30, lancerRatio: 30, marksmanRatio: 40,
            leads: [1, 1, 1], // Pre-filled so Save validation passes
            joiners: [2, 2, 2, 2]
        },
        defense: {
            infantryRatio: 0, lancerRatio: 0, marksmanRatio: 0,
            leads: [null, null, null],
            joiners: [null, null, null, null]
        },
        mapData: {
            SvS: { topLeft: 'State 100', topRight: '', bottomLeft: '', bottomRight: '' }
        }
    };

    const mockPets = {
        date: '2026-03-20',
        schedule: { 1: [100], 2: [], 3: [] }
    };

    beforeEach(() => {
        vi.clearAllMocks();

        useAuth.mockReturnValue({ user: mockUser });
        useApp.mockReturnValue({ features: { Squads: true, Discord: true } });

        client.get.mockImplementation((url) => {
            if (url.includes('/heroes')) return Promise.resolve({ data: mockHeroes });
            if (url.includes('/active')) return Promise.resolve({ data: mockActiveMeta });
            if (url.includes('/captains')) return Promise.resolve({ data: mockCaptains });
            if (url.includes('/pets')) return Promise.resolve({ data: mockPets });
            return Promise.resolve({ data: {} });
        });
    });

    const renderComponent = () => render(
        <MemoryRouter>
            <Strategy />
        </MemoryRouter>
    );

    it('loads initial strategy data and saves attack meta', async () => {
        client.post.mockResolvedValueOnce({});
        renderComponent();

        // Verify loading completes and data populates (findAll because both Inf and Lancer are 30)
        const ratioInputs = await screen.findAllByDisplayValue('30');
        expect(ratioInputs.length).toBeGreaterThan(0);
        expect(screen.getAllByDisplayValue('Greg (Infantry)').length).toBeGreaterThan(0);

        // Change a ratio
        const infInput = screen.getAllByRole('spinbutton')[0];
        fireEvent.change(infInput, { target: { value: '50' } });

        // Click Save Plan
        const saveBtn = screen.getByRole('button', { name: /Save Plan/i });
        fireEvent.click(saveBtn);

        await waitFor(() => {
            // It should post the updated meta
            expect(client.post).toHaveBeenCalledWith('/moderator/strategy/meta', expect.objectContaining({
                type: 'Attack',
                infantryRatio: 50,
                leads: [1, 1, 1],
                joiners: [2, 2, 2, 2]
            }));
            expect(toast.success).toHaveBeenCalledWith('Attack saved successfully!');
        });
    });

    it('prevents saving attack/defense if heroes are missing', async () => {
        renderComponent();
        await screen.findAllByDisplayValue('30');

        // Switch to Defense tab (which has null heroes in our mock)
        const defTab = screen.getByRole('button', { name: /Defense/i });
        fireEvent.click(defTab);

        // Click Save Plan
        const saveBtn = screen.getByRole('button', { name: /Save Plan/i });
        fireEvent.click(saveBtn);

        expect(toast.error).toHaveBeenCalledWith('Please assign all 3 Lead Heroes.');
        expect(client.post).not.toHaveBeenCalled();
    });

    it('updates tactical map data and saves it', async () => {
        client.post.mockResolvedValueOnce({});
        renderComponent();
        await screen.findAllByDisplayValue('30');

        // Switch to Tactical Map
        const mapTab = screen.getByRole('button', { name: /Tactical Map/i });
        fireEvent.click(mapTab);

        // Verify existing map data populated
        expect(await screen.findByDisplayValue('State 100')).toBeInTheDocument();

        // Switch to Tundra Map
        const tundraBtn = screen.getByRole('button', { name: 'Tundra' });
        fireEvent.click(tundraBtn);

        // Find the Imperial position dropdown and assign CapOne (fid: 100)
        const imperialSelect = screen.getAllByRole('combobox')[0]; // Imperial is the first one rendered
        fireEvent.change(imperialSelect, { target: { value: '100' } });

        // Save Plan
        const saveBtn = screen.getByRole('button', { name: /Save Plan/i });
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/strategy/meta', expect.objectContaining({
                type: 'TacticalMap',
                mapData: expect.objectContaining({
                    Tundra: expect.objectContaining({ imperial: '100' })
                })
            }));
        });
    });

    it('manages pet schedule and saves', async () => {
        client.post.mockResolvedValueOnce({});
        renderComponent();
        await screen.findAllByDisplayValue('30');

        // Switch to Pet Schedule
        const petTab = screen.getByRole('button', { name: /Pets/i });
        fireEvent.click(petTab);

        // Verify existing assignment loaded (CapOne is in Slot 1)
        expect(await screen.findByText('CapOne')).toBeInTheDocument();

        // Assign CapOne to Slot 2
        const slot2Select = screen.getByLabelText('Assign to slot 2');
        fireEvent.change(slot2Select, { target: { value: '100' } });

        // Since CapOne is now in Slot 1 AND Slot 2, there are two remove buttons.
        // Get all of them and click the first one (Slot 1).
        const removeBtns = screen.getAllByLabelText('Remove CapOne');
        fireEvent.click(removeBtns[0]);

        // Save
        const saveBtn = screen.getByRole('button', { name: /Save Plan/i });
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/strategy/pets', expect.objectContaining({
                fightDate: '2026-03-20',
                schedule: expect.objectContaining({
                    1: [],      // Removed CapOne
                    2: [100]    // Added CapOne
                })
            }));
        });
    });

    it('announces text strategy to discord', async () => {
        mockExecuteNotify.mockResolvedValueOnce({});
        renderComponent();
        await screen.findAllByDisplayValue('30');

        const announceBtn = screen.getByRole('button', { name: /Announce/i });
        fireEvent.click(announceBtn);

        await waitFor(() => {
            expect(mockExecuteNotify).toHaveBeenCalledWith({
                target: 'Attack',
                fightDate: ''
            });
            expect(toast.success).toHaveBeenCalledWith('Published Attack to Discord!');
        });
    });

    it('generates image via html2canvas and announces map to discord', async () => {
        client.post.mockResolvedValueOnce({});
        renderComponent();
        await screen.findAllByDisplayValue('30');

        // Switch to Tactical Map
        const mapTab = screen.getByRole('button', { name: /Tactical Map/i });
        fireEvent.click(mapTab);

        const announceBtn = screen.getByRole('button', { name: /Announce/i });
        fireEvent.click(announceBtn);

        // It should briefly show "Snapping..."
        expect(screen.getByText('Snapping...')).toBeInTheDocument();

        await waitFor(() => {
            // Checks that the multipart form data was sent
            expect(client.post).toHaveBeenCalledWith('/moderator/discord/announce-map', expect.any(FormData), expect.objectContaining({
                headers: { 'Content-Type': 'multipart/form-data' }
            }));
            expect(toast.success).toHaveBeenCalledWith('Map published to Discord!');
        });
    });
});