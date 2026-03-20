import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PlayerDashboard from '../PlayerDashboard';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// 1. Mock AuthContext
const mockLogout = vi.fn();
vi.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ logout: mockLogout })
}));

// 2. Mock API Client
vi.mock('../../api/client', () => ({
    default: { get: vi.fn() }
}));

describe('PlayerDashboard Component', () => {
    const fullMockData = {
        player: {
            nickname: 'CommanderShepard',
            fid: '999888',
            avatar: 'http://avatar.url',
            stoveImg: '10',
            allianceName: '[N7] Normandy',
            troopType: 'Infantry',
            normalPower: 1500000,
            power: 2000000,
            fightingAllianceName: '[WAR] Reapers',
            teamName: 'Alpha Squad'
        },
        teammates: [
            { fid: '111222', nickname: 'Garrus', avatar: 'http://avatar2.url', stoveImg: 'http://fc.url', normalPower: 1200000, power: 1800000 }
        ],
        ministries: [
            // slotIndex 5 translates to 02:30 - 03:00
            { id: 1, activeDate: '2026-03-20T00:00:00Z', buffName: 'Construction', slotIndex: 5 }
        ],
        forts: [
            { buildingType: 'Stronghold', internalId: 'S-12' }
        ]
    };

    const emptyMockData = {
        player: {
            nickname: 'LoneWolf',
            fid: '111111',
            allianceName: null,
            troopType: null,
            fightingAllianceName: null,
            teamName: null
        },
        teammates: [],
        ministries: [],
        forts: []
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    const renderComponent = () => {
        return render(
            <MemoryRouter>
                <PlayerDashboard />
            </MemoryRouter>
        );
    };

    it('shows loading state initially', () => {
        // Delay the mock resolution slightly so we can catch the loading screen
        client.get.mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 100)));
        renderComponent();
        expect(screen.getByText('Loading Command Center...')).toBeInTheDocument();
    });

    it('renders full player profile, squad, ministries, and forts', async () => {
        client.get.mockResolvedValueOnce({ data: fullMockData });
        renderComponent();

        // 1. Identity Card
        const nameElements = await screen.findAllByText('CommanderShepard');
        expect(nameElements.length).toBeGreaterThan(0);

        expect(screen.getByText('FID: 999888')).toBeInTheDocument();
        expect(screen.getByText('[N7] Normandy')).toBeInTheDocument();
        expect(screen.getByText('Infantry')).toBeInTheDocument();
        expect(screen.getByText('1,500,000')).toBeInTheDocument(); // Base Power
        expect(screen.getByText('2,000,000')).toBeInTheDocument(); // Tundra Power

        // 2. Assigned Alliance
        expect(screen.getByText('[WAR] Reapers')).toBeInTheDocument();
        expect(screen.getByText('Active Assignment')).toBeInTheDocument();

        // 3. Squad Card
        expect(screen.getByText('Alpha Squad')).toBeInTheDocument();
        expect(screen.getByText('Garrus')).toBeInTheDocument();
        expect(screen.getByText('⚡ 1.2M')).toBeInTheDocument(); // Formatted teammate power

        // 4. Ministry Card (Checking Date/Time formatting)
        expect(screen.getByText('20 Mar 2026')).toBeInTheDocument();
        expect(screen.getByText('(Construction)')).toBeInTheDocument();
        expect(screen.getByText('02:30 - 03:00 (UTC)')).toBeInTheDocument();

        // 5. Forts Card
        expect(screen.getByText('Stronghold')).toBeInTheDocument();
        expect(screen.getByText('S-12')).toBeInTheDocument();
    });

    it('renders fallback UI when lists are empty and player has no assignments', async () => {
        client.get.mockResolvedValueOnce({ data: emptyMockData });
        renderComponent();

        // Updated to handle multiple elements
        const nameElements = await screen.findAllByText('LoneWolf');
        expect(nameElements.length).toBeGreaterThan(0);

        // Fallback texts
        expect(screen.getByText('No Alliance')).toBeInTheDocument();
        expect(screen.getByText('Unknown Troops')).toBeInTheDocument();
        expect(screen.getByText('Awaiting Orders')).toBeInTheDocument();
        expect(screen.getByText('No Squad Assigned')).toBeInTheDocument();
        expect(screen.getByText('No upcoming reservations')).toBeInTheDocument();
        expect(screen.getByText('No forts assigned this week')).toBeInTheDocument();
    });

    it('triggers logout when the logout button is clicked', async () => {
        client.get.mockResolvedValueOnce({ data: fullMockData });
        renderComponent();

        // Wait for render using findAllByText
        await screen.findAllByText('CommanderShepard');

        fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

        expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    it('handles API errors gracefully', async () => {
        client.get.mockRejectedValueOnce(new Error('Network Error'));
        renderComponent();

        // If it fails, data remains null, so it should fall back to "Profile not found."
        expect(await screen.findByText('Profile not found.')).toBeInTheDocument();
    });
});