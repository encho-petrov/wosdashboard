import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AuditLogs from '../AuditLogs';
import client from '../../api/client';

// 1. Mock the API Client
vi.mock('../../api/client', () => ({
    default: {
        get: vi.fn(),
    },
}));

// 2. Mock AdminLayout
vi.mock('../../components/layout/AdminLayout', () => ({
    default: ({ children }) => <div data-testid="admin-layout">{children}</div>,
}));

describe('AuditLogs Component', () => {
    const mockLogs = [
        {
            id: 1,
            created_at: '2026-03-19T10:00:00Z',
            username: 'CommanderShepard',
            action: 'UPDATE_ALLIANCE',
            details: 'Changed alliance type to Fighting',
            ip_address: '192.168.1.100'
        },
        {
            id: 2,
            created_at: '2026-03-19T11:30:00Z',
            username: null, // Testing the 'SYSTEM' fallback
            action: 'CRON_BACKUP',
            details: 'Automated database backup completed',
            ip_address: '127.0.0.1'
        }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    const renderComponent = () => {
        return render(
            <MemoryRouter>
                <AuditLogs />
            </MemoryRouter>
        );
    };

    it('displays loading state initially and then renders fetched logs', async () => {
        client.get.mockResolvedValueOnce({ data: mockLogs });
        renderComponent();

        // The loading text should be present immediately
        expect(screen.getByText('Loading system logs...')).toBeInTheDocument();

        // Wait for the API call to resolve and the UI to update
        expect(await screen.findByText('UPDATE_ALLIANCE')).toBeInTheDocument();

        // Check specific fields
        expect(screen.getByText('CommanderShepard')).toBeInTheDocument();
        expect(screen.getByText('Changed alliance type to Fighting')).toBeInTheDocument();

        // Check fallback for null username
        expect(screen.getByText('SYSTEM')).toBeInTheDocument();
        expect(screen.getByText('Automated database backup completed')).toBeInTheDocument();
    });

    it('filters logs based on the search input (case-insensitive)', async () => {
        client.get.mockResolvedValueOnce({ data: mockLogs });
        renderComponent();

        // Wait for data to load
        await screen.findByText('UPDATE_ALLIANCE');

        const searchInput = screen.getByPlaceholderText('Search actions or details...');

        // Search for something specific to log 2
        fireEvent.change(searchInput, { target: { value: 'automated' } });

        // Log 2 should remain
        expect(screen.getByText('CRON_BACKUP')).toBeInTheDocument();

        // Log 1 should be filtered out
        expect(screen.queryByText('UPDATE_ALLIANCE')).not.toBeInTheDocument();

        // Clear search, both should be back
        fireEvent.change(searchInput, { target: { value: '' } });
        expect(screen.getByText('UPDATE_ALLIANCE')).toBeInTheDocument();
    });

    it('displays an empty state message when the API returns no data', async () => {
        client.get.mockResolvedValueOnce({ data: [] });
        renderComponent();

        expect(await screen.findByText('No logs found matching your search.')).toBeInTheDocument();
    });

    it('handles API errors gracefully without crashing', async () => {
        // Force the API to reject/fail
        client.get.mockRejectedValueOnce(new Error('Network Error'));
        renderComponent();

        // It should swallow the error, set logs to [], and show the empty state
        expect(await screen.findByText('No logs found matching your search.')).toBeInTheDocument();
    });
});