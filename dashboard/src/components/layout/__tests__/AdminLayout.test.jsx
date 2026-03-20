import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AdminLayout from '../AdminLayout';
import { useAuth } from '../../../context/AuthContext';
import { useApp } from '../../../context/AppContext';
import client from '../../../api/client';

// 1. Mock Contexts
vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../../context/AppContext', () => ({ useApp: vi.fn() }));

// 2. Mock API Client
vi.mock('../../../api/client', () => ({
    default: { get: vi.fn() }
}));

// 3. Mock React Router Hooks
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useLocation: () => ({ pathname: '/dashboard' })
    };
});

// 4. Mock the Navigation Config to test the filtering logic precisely
vi.mock('../../../config/navigation', () => ({
    navLinks: [
        { path: '/dashboard', name: 'DashboardLink', icon: () => 'Icon', requiredRoles: ['admin', 'moderator'] },
        { path: '/admin-only', name: 'AdminOnlyLink', icon: () => 'Icon', requiredRoles: ['admin'] },
        { path: '/feature', name: 'FeatureFlagLink', icon: () => 'Icon', requiredRoles: ['admin'], featureKey: 'SpecialFeature' },
        { path: '/alliance', name: 'AllianceOnlyLink', icon: () => 'Icon', requiredRoles: ['admin'], requiresAlliance: true }
    ]
}));

// 5. Mock Child Components
vi.mock('../../PullToRefresh', () => ({ default: ({ children }) => <div data-testid="pull-to-refresh">{children}</div> }));
vi.mock('../../MfaSetupModal', () => ({ default: () => <div data-testid="mfa-modal">MFA Setup Modal</div> }));
vi.mock('../../LiveSyncManager', () => ({ default: () => <div data-testid="live-sync">LiveSync</div> }));

describe('AdminLayout Component', () => {
    const mockLogout = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        // Default to a standard Admin user with MFA enabled and a Feature enabled
        useAuth.mockReturnValue({
            user: { role: 'admin', username: 'TestAdmin', mfaEnabled: true, allianceId: null },
            logout: mockLogout
        });

        useApp.mockReturnValue({
            features: { SpecialFeature: true }
        });

        // Default API response for pending queue
        client.get.mockResolvedValue({ data: [] });
    });

    const renderLayout = (props = {}) => render(
        <MemoryRouter>
            <AdminLayout title="Test Page Title" actions={<button>Header Action</button>} {...props}>
                <div data-testid="page-content">Main Page Content</div>
            </AdminLayout>
        </MemoryRouter>
    );

    it('renders standard layout elements and children', () => {
        renderLayout();

        // Headers and Actions
        expect(screen.getByText('Test Page Title')).toBeInTheDocument();
        expect(screen.getByText('Header Action')).toBeInTheDocument();

        // Profile area
        expect(screen.getByText('TestAdmin')).toBeInTheDocument();

        // Main content
        expect(screen.getByTestId('page-content')).toBeInTheDocument();
        expect(screen.getByTestId('live-sync')).toBeInTheDocument();
    });

    it('filters navigation links based on roles, alliance, and features', () => {
        // Current User: Admin, NO Alliance, SpecialFeature is TRUE
        renderLayout();

        expect(screen.getByText('DashboardLink')).toBeInTheDocument(); // Has role
        expect(screen.getByText('AdminOnlyLink')).toBeInTheDocument(); // Has role
        expect(screen.getByText('FeatureFlagLink')).toBeInTheDocument(); // Feature is true
        expect(screen.queryByText('AllianceOnlyLink')).not.toBeInTheDocument(); // User lacks allianceId
    });

    it('hides feature-flagged links if the feature is explicitly disabled', () => {
        useApp.mockReturnValue({ features: { SpecialFeature: false } }); // Turn feature off
        renderLayout();

        expect(screen.queryByText('FeatureFlagLink')).not.toBeInTheDocument();
    });

    it('hides admin links from moderators', () => {
        useAuth.mockReturnValue({
            user: { role: 'moderator', username: 'Mod', mfaEnabled: true },
            logout: mockLogout
        });
        renderLayout();

        expect(screen.getByText('DashboardLink')).toBeInTheDocument();
        expect(screen.queryByText('AdminOnlyLink')).not.toBeInTheDocument();
    });

    it('enforces MFA setup and hides page content', () => {
        useAuth.mockReturnValue({
            user: { role: 'admin', username: 'Admin', mfaEnabled: false }, // MFA Disabled
            logout: mockLogout
        });
        renderLayout();

        // Modal should be visible
        expect(screen.getByTestId('mfa-modal')).toBeInTheDocument();

        // Emergency disconnect button should be visible
        expect(screen.getByRole('button', { name: /Disconnect/i })).toBeInTheDocument();

        // MAIN CONTENT SHOULD BE HIDDEN
        expect(screen.queryByTestId('page-content')).not.toBeInTheDocument();
    });

    it('polls for pending users and shows the red badge', async () => {
        client.get.mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }] }); // 2 pending users
        renderLayout();

        await waitFor(() => {
            expect(client.get).toHaveBeenCalledWith('/moderator/admin/pending');
            expect(screen.getByTestId('pending-badge')).toBeInTheDocument();
        });
    });

    it('does not poll for pending users if role is not admin', async () => {
        useAuth.mockReturnValue({
            user: { role: 'moderator', username: 'Mod', mfaEnabled: true },
            logout: mockLogout
        });
        renderLayout();

        expect(client.get).not.toHaveBeenCalled();
        expect(screen.queryByTestId('pending-badge')).not.toBeInTheDocument();
    });

    it('handles logout from the sidebar', () => {
        renderLayout();

        const logoutBtn = screen.getByRole('button', { name: /Logout/i });
        fireEvent.click(logoutBtn);

        expect(mockLogout).toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith('/login');
    });

    it('handles mobile sidebar toggle', () => {
        renderLayout();

        // By default, the fixed overlay background should not be there
        expect(screen.queryByRole('presentation')).not.toBeInTheDocument();

        const toggleBtn = screen.getByLabelText('Toggle Sidebar');
        fireEvent.click(toggleBtn);

        // Click the overlay to close it (simulating clicking outside)
        const overlay = document.querySelector('.bg-black\\/80');
        expect(overlay).toBeInTheDocument();

        fireEvent.click(overlay);

        // It should be removed from the DOM
        expect(document.querySelector('.bg-black\\/80')).not.toBeInTheDocument();
    });
});