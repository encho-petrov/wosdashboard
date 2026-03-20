import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RedemptionWidget from '../RedemptionWidget';
import client from '../../api/client';
import { toast } from 'react-toastify';

// 1. Mock Contexts & Utils
vi.mock('react-toastify', () => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
}));

// 2. Mock API
vi.mock('../../api/client', () => ({
    default: { get: vi.fn(), post: vi.fn() }
}));

describe('RedemptionWidget Component', () => {
    const mockHistory = [
        {
            jobId: 'job-123',
            createdAt: '2026-03-10T12:00:00Z',
            giftCodes: '["SPRING2026", "WINTER2026"]',
            processedPlayers: 50,
            totalPlayers: 50,
            status: 'COMPLETED',
            reportPath: 'report-job-123.csv'
        }
    ];

    const mockActiveJob = {
        active: true,
        data: {
            status: 'Redeeming',
            processed: 25,
            total: 100
        }
    };

    const mockInactiveJob = { active: false };

    let createObjectURLSpy;
    let anchorClickSpy;

    beforeEach(() => {
        vi.clearAllMocks();

        // NOTE: Removed vi.useFakeTimers() from here so standard tests run normally!

        createObjectURLSpy = vi.fn(() => 'blob:http://localhost/mock-file');
        global.URL.createObjectURL = createObjectURLSpy;

        anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

        client.get.mockImplementation((url) => {
            if (url === '/moderator/jobs') return Promise.resolve({ data: mockHistory });
            if (url === '/moderator/captcha-balance') return Promise.resolve({ data: { balance: '42.50' } });
            if (url === '/moderator/job/current') return Promise.resolve({ data: mockInactiveJob });
            if (url.includes('/moderator/reports/')) return Promise.resolve({ data: 'mock,csv,data' });
            return Promise.resolve({ data: {} });
        });
    });

    afterEach(() => {
        anchorClickSpy.mockRestore();
        global.URL.createObjectURL = undefined;
    });

    it('loads initial data and renders the balance and history', async () => {
        render(<RedemptionWidget />);

        expect(await screen.findByText('$42.50')).toBeInTheDocument();
        expect(screen.getByText('Status Healthy')).toBeInTheDocument();

        expect(screen.getByText('SPRING2026, WINTER2026')).toBeInTheDocument();
        expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    });

    it('shows warning if trying to execute batch with empty input', async () => {
        render(<RedemptionWidget />);
        await screen.findByText('$42.50');

        const submitBtn = screen.getByRole('button', { name: /Execute Batch/i });
        fireEvent.click(submitBtn);

        expect(toast.warning).toHaveBeenCalledWith('Enter gift codes.');
        expect(client.post).not.toHaveBeenCalled();
    });

    it('submits a new batch job successfully', async () => {
        client.post.mockResolvedValueOnce({});
        render(<RedemptionWidget />);
        await screen.findByText('$42.50');

        const input = screen.getByLabelText('Gift Codes Input');
        fireEvent.change(input, { target: { value: 'CODE1, CODE2,   CODE3  ' } });

        const submitBtn = screen.getByRole('button', { name: /Execute Batch/i });
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/moderator/redeem', {
                giftCodes: ['CODE1', 'CODE2', 'CODE3']
            });
            expect(toast.success).toHaveBeenCalledWith('Job Launched!');
            expect(input.value).toBe('');
        });
    });

    it('displays the active job stream when a job is running', async () => {
        vi.useFakeTimers(); // 1. Turn on fake timers ONLY for this test

        client.get.mockImplementation((url) => {
            if (url === '/moderator/jobs') return Promise.resolve({ data: mockHistory });
            if (url === '/moderator/captcha-balance') return Promise.resolve({ data: { balance: '42.50' } });
            if (url === '/moderator/job/current') return Promise.resolve({ data: mockActiveJob });
            return Promise.resolve({ data: {} });
        });

        render(<RedemptionWidget />);

        // 2. Fast-forward time to trigger the component's internal setInterval
        vi.advanceTimersByTime(3000);

        // 3. Immediately switch back to real timers so RTL's findByText can wait for the DOM to update!
        vi.useRealTimers();

        expect(await screen.findByText('Process Running...')).toBeInTheDocument();
        expect(screen.getByText('Processed: 25')).toBeInTheDocument();
        expect(screen.getByText('Total: 100')).toBeInTheDocument();
    });

    it('downloads a report file successfully', async () => {
        render(<RedemptionWidget />);
        await screen.findByText('$42.50');

        const downloadBtn = screen.getByLabelText('Download report job-123');
        fireEvent.click(downloadBtn);

        await waitFor(() => {
            expect(client.get).toHaveBeenCalledWith('/moderator/reports/report-job-123.csv', {
                responseType: 'blob'
            });
            expect(createObjectURLSpy).toHaveBeenCalled();
            expect(anchorClickSpy).toHaveBeenCalled();
        });
    });
});