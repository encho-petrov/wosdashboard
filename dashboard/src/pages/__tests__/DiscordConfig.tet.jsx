import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DiscordConfig from '../DiscordConfig';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';

// 1. Mock Contexts & Utils
vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('react-toastify', () => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
}));

// 2. Mock API
vi.mock('../../api/client', () => ({
    default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }
}));

// 3. Mock Layout
vi.mock('../../components/layout/AdminLayout', () => ({
    default: ({ children, title }) => (
        <div data-testid="admin-layout">
            <h1 data-testid="layout-title">{title}</h1>
            {children}
        </div>
    )
}));

// 4. Mock the lazy-loaded Crons component to avoid Suspense test warnings
vi.mock('../../components/DiscordCrons', () => ({
    default: () => <div data-testid="discord-crons-mock">Crons Mock</div>
}));

describe('DiscordConfig Component', () => {
    const originalConfirm = window.confirm;
    const originalLocation = window.location;

    const mockUser = { role: 'admin' };

    const mockChannels = [
        { id: 'c1', name: 'general' },
        { id: 'c2', name: 'alerts' }
    ];

    const mockRoles = [
        { id: 'r1', name: 'everyone' }
    ];

    const mockLinkedStatus = {
        isLinked: true,
        guildName: 'Test Alliance Server',
        routes: {
            general_announcements: { channelId: 'c1', pingRoleId: 'r1' }
        }
    };

    beforeAll(() => {
        // Safely mock window.location so assigning .href doesn't crash JSDOM
        delete window.location;
        window.location = { ...originalLocation, href: '', search: '' };
    });

    afterAll(() => {
        window.location = originalLocation;
    });

    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        useAuth.mockReturnValue({ user: mockUser });

        // Setup default API responses
        client.get.mockImplementation((url) => {
            if (url.includes('/status')) return Promise.resolve({ data: { isLinked: false } });
            if (url.includes('/channels')) return Promise.resolve({ data: mockChannels });
            if (url.includes('/roles')) return Promise.resolve({ data: mockRoles });
            if (url.includes('/login')) return Promise.resolve({ data: { url: 'https://discord.com/oauth2/test' } });
            return Promise.resolve({ data: {} });
        });
    });

    afterEach(() => {
        window.confirm = originalConfirm;
    });

    const renderComponent = () => render(
        <MemoryRouter>
            <DiscordConfig />
        </MemoryRouter>
    );

    it('renders the unlinked state and allows initiating connection', async () => {
        renderComponent();

        // Verify loading state passes and unlinked UI shows
        expect(await screen.findByText('No Server Linked')).toBeInTheDocument();

        // Click connect button
        const connectBtn = screen.getByRole('button', { name: /Connect Alliance Discord/i });
        fireEvent.click(connectBtn);

        await waitFor(() => {
            expect(client.get).toHaveBeenCalledWith('/moderator/discord/login?scope=alliance');
            expect(window.location.href).toBe('https://discord.com/oauth2/test');
        });
    });

    it('renders the linked state and populates saved routes', async () => {
        // Override status to be linked for this test
        client.get.mockImplementation((url) => {
            if (url.includes('/status')) return Promise.resolve({ data: mockLinkedStatus });
            if (url.includes('/channels')) return Promise.resolve({ data: mockChannels });
            if (url.includes('/roles')) return Promise.resolve({ data: mockRoles });
            return Promise.resolve({ data: {} });
        });

        renderComponent();

        // Verify guild name and UI
        expect(await screen.findByText('Test Alliance Server')).toBeInTheDocument();
        expect(screen.getByText('Connected')).toBeInTheDocument();

        // Verify the mock DiscordCrons component rendered
        expect(screen.getByTestId('discord-crons-mock')).toBeInTheDocument();

        // Verify the "General Announcements" route pre-populated its dropdowns based on mockLinkedStatus
        const generalChannelSelect = screen.getAllByRole('combobox')[0]; // Channel select
        const generalRoleSelect = screen.getAllByRole('combobox')[1];    // Role select

        expect(generalChannelSelect.value).toBe('c1');
        expect(generalRoleSelect.value).toBe('r1');
    });

    it('allows switching to state scope and fetches new data', async () => {
        renderComponent();
        await screen.findByText('No Server Linked');

        // Click Global State Settings toggle
        const stateToggle = screen.getByRole('button', { name: /Global State Settings/i });
        fireEvent.click(stateToggle);

        await waitFor(() => {
            // It should re-fetch status with scope=state
            expect(client.get).toHaveBeenCalledWith('/moderator/discord/status?scope=state');
        });

        // The available events array should change to state-level events
        expect(await screen.findByText('Ministry Buff Alerts')).toBeInTheDocument();
    });

    it('allows saving a new route configuration', async () => {
        client.get.mockImplementation((url) => {
            if (url.includes('/status')) return Promise.resolve({ data: { isLinked: true, guildName: 'Test', routes: {} } });
            if (url.includes('/channels')) return Promise.resolve({ data: mockChannels });
            if (url.includes('/roles')) return Promise.resolve({ data: mockRoles });
            return Promise.resolve({ data: {} });
        });
        client.post.mockResolvedValueOnce({});

        renderComponent();
        await screen.findByText('Test'); // Wait for linked state

        // Find the General Announcements channel select (first combobox on the page)
        const channelSelect = screen.getAllByRole('combobox')[0];
        fireEvent.change(channelSelect, { target: { value: 'c2' } });

        // Click Save
        const saveBtn = screen.getAllByTitle('Save Route')[0];
        fireEvent.click(saveBtn);

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/discord/routes?scope=alliance', {
                eventType: 'general_announcements',
                channelId: 'c2',
                pingRoleId: null // We didn't select a role
            });
            expect(toast.success).toHaveBeenCalledWith('Route saved successfully!');
        });
    });

    it('allows unlinking a saved route', async () => {
        client.get.mockImplementation((url) => {
            if (url.includes('/status')) return Promise.resolve({ data: mockLinkedStatus });
            if (url.includes('/channels')) return Promise.resolve({ data: mockChannels });
            if (url.includes('/roles')) return Promise.resolve({ data: mockRoles });
            return Promise.resolve({ data: {} });
        });
        client.delete.mockResolvedValueOnce({});

        renderComponent();
        await screen.findByText('Test Alliance Server');

        // Click the unlink button (only exists because general_announcements is saved)
        const unlinkBtn = screen.getByTitle('Unlink this channel');
        fireEvent.click(unlinkBtn);

        expect(window.confirm).toHaveBeenCalled();

        await waitFor(() => {
            expect(client.delete).toHaveBeenCalledWith('/moderator/discord/routes/general_announcements?scope=alliance');
            expect(toast.success).toHaveBeenCalledWith('Channel unlinked successfully!');
        });
    });

    it('allows disconnecting the entire server', async () => {
        client.get.mockImplementation((url) => {
            if (url.includes('/status')) return Promise.resolve({ data: mockLinkedStatus });
            if (url.includes('/channels')) return Promise.resolve({ data: mockChannels });
            if (url.includes('/roles')) return Promise.resolve({ data: mockRoles });
            return Promise.resolve({ data: {} });
        });
        client.delete.mockResolvedValueOnce({});

        renderComponent();
        await screen.findByText('Test Alliance Server');

        const disconnectBtn = screen.getByRole('button', { name: /Disconnect Server/i });
        fireEvent.click(disconnectBtn);

        expect(window.confirm).toHaveBeenCalled();

        await waitFor(() => {
            expect(client.delete).toHaveBeenCalledWith('/moderator/discord/disconnect?scope=alliance');
            expect(toast.success).toHaveBeenCalledWith('Server disconnected and all configurations wiped.');
        });
    });
});