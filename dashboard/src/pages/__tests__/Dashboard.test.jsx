import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../Dashboard'; // Adjust path if needed
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';

// 1. Mock the Context Hooks
vi.mock('../../context/AuthContext', () => ({
    useAuth: vi.fn(),
}));

vi.mock('../../context/AppContext', () => ({
    useApp: vi.fn(),
}));

vi.mock('../../components/MfaSetupModal', () => ({
    default: () => <div data-testid="mfa-modal">MFA Required</div>,
}));

// 2. Mock AdminLayout to isolate Dashboard logic
// We just render the children so we can test the Dashboard grid.
vi.mock('../../components/layout/AdminLayout', () => ({
    default: ({ children }) => <div data-testid="admin-layout">{children}</div>,
}));

// 3. Mock the RedemptionWidget so we can just check if it mounts
vi.mock('../../components/RedemptionWidget', () => ({
    default: () => <div data-testid="redemption-widget">Redemption Widget Active</div>,
}));

describe('Dashboard Access & Feature Flags', () => {
    // Reset mocks before each test
    beforeEach(() => {
        vi.clearAllMocks();
        sessionStorage.clear();
    });

    const renderDashboard = () => {
        return render(
            <MemoryRouter>
                <Dashboard />
            </MemoryRouter>
        );
    };

    it('renders standard admin cards but hides alliance-only cards if user has no alliance', () => {
        // Mock user: Admin, but NO alliance
        useAuth.mockReturnValue({
            user: { role: 'admin', allianceId: null },
        });

        // Mock features: Everything enabled
        useApp.mockReturnValue({
            features: { Foundry: true, Discord: true },
        });

        renderDashboard();

        // Roster should be visible (requiresAdmin, no alliance needed)
        expect(screen.getByText('Roster')).toBeInTheDocument();

        // Foundry should NOT be visible (requiresAlliance)
        expect(screen.queryByText('Foundry')).not.toBeInTheDocument();

        // Discord should NOT be visible (requiresAlliance)
        expect(screen.queryByText('Discord')).not.toBeInTheDocument();
    });

    it('renders alliance-only cards when the user has an alliance', () => {
        // Mock user: Admin WITH an alliance
        useAuth.mockReturnValue({
            user: { role: 'admin', allianceId: 10 },
        });

        useApp.mockReturnValue({
            features: { Foundry: true, Discord: true },
        });

        renderDashboard();

        expect(screen.getByText('Foundry')).toBeInTheDocument();
        expect(screen.getByText('Discord')).toBeInTheDocument();
    });

    it('hides feature-flagged cards when the feature is disabled globally', () => {
        useAuth.mockReturnValue({
            user: { role: 'admin', allianceId: 10 },
        });

        // Mock features: Turn off WarRoom and Transfers
        useApp.mockReturnValue({
            features: { WarRoom: false, Transfers: false },
        });

        renderDashboard();

        // Roster should still be there (no feature flag)
        expect(screen.getByText('Roster')).toBeInTheDocument();

        // War Room and Transfers should be gone
        expect(screen.queryByText('War Room')).not.toBeInTheDocument();
        expect(screen.queryByText('Transfers')).not.toBeInTheDocument();
    });

    it('hides moderator-restricted cards from normal players (fallback test)', () => {
        // Even though App.jsx catches this, Dashboard should also filter defensively
        useAuth.mockReturnValue({
            user: { role: 'player', allianceId: 10 },
        });

        useApp.mockReturnValue({ features: {} });

        renderDashboard();

        // Users (Admin only) should not be visible
        expect(screen.queryByText('Users')).not.toBeInTheDocument();
        // Alliances (Admin only) should not be visible
        expect(screen.queryByText('Alliances')).not.toBeInTheDocument();
    });

    it('shows the Redemption Widget only if the GiftCodes feature is enabled', async () => {
        useAuth.mockReturnValue({ user: { role: 'admin' } });

        // 1. Test when enabled
        useApp.mockReturnValue({ features: { GiftCodes: true } });
        const { unmount } = renderDashboard();
        //expect(screen.getByTestId('redemption-widget')).toBeInTheDocument();
        expect(await screen.findByTestId('redemption-widget')).toBeInTheDocument();

        unmount(); // Unmount to test the false case cleanly

        // 2. Test when disabled
        useApp.mockReturnValue({ features: { GiftCodes: false } });
        renderDashboard();
        expect(await screen.queryByTestId('redemption-widget')).not.toBeInTheDocument();
    });

    it('forces MFA Modal if mfa_enabled is false in sessionStorage', async () => {
        useAuth.mockReturnValue({ user: { role: 'admin' } });
        useApp.mockReturnValue({ features: {} });

        sessionStorage.setItem('mfa_enabled', 'false');

        renderDashboard();

        // 2. Use 'await screen.findByTestId' to wait for the useEffect to fire
        expect(await screen.findByTestId('mfa-modal')).toBeInTheDocument();
    });
});