import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Login from '../Login';
import { useAuth } from '../../context/AuthContext';
import client from '../../api/client';
import { startAuthentication } from '@simplewebauthn/browser';

// 1. Mock AuthContext
const mockLogin = vi.fn();
const mockLoginPlayer = vi.fn();
vi.mock('../../context/AuthContext', () => ({
    useAuth: () => ({
        login: mockLogin,
        loginPlayer: mockLoginPlayer,
    }),
}));

// 2. Mock React Router's useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

// 3. Mock API and External Libs
vi.mock('../../api/client', () => ({
    default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('@simplewebauthn/browser', () => ({
    startAuthentication: vi.fn(),
}));

vi.mock('react-toastify', () => ({
    toast: { error: vi.fn() },
}));

describe('Login Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const renderComponent = () => {
        return render(
            <MemoryRouter>
                <Login />
            </MemoryRouter>
        );
    };

    it('renders the player tab by default and handles player login', async () => {
        mockLoginPlayer.mockResolvedValueOnce(true);
        renderComponent();

        // Verify default view
        expect(screen.getByText('Alliance Portal')).toBeInTheDocument();

        // Fill FID
        fireEvent.change(screen.getByLabelText(/Game ID \(FID\)/i), { target: { value: '123456' } });

        // Submit
        fireEvent.click(screen.getByRole('button', { name: /Enter Portal/i }));

        await waitFor(() => {
            expect(mockLoginPlayer).toHaveBeenCalledWith('123456');
            expect(mockNavigate).toHaveBeenCalledWith('/');
        });
    });

    it('displays an error if player login fails', async () => {
        mockLoginPlayer.mockRejectedValueOnce({ response: { data: { error: 'Invalid FID' } } });
        renderComponent();

        fireEvent.change(screen.getByLabelText(/Game ID \(FID\)/i), { target: { value: '000' } });
        fireEvent.click(screen.getByRole('button', { name: /Enter Portal/i }));

        expect(await screen.findByText('Invalid FID')).toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('switches to staff tab and handles standard login (No MFA)', async () => {
        // Mock standard login response
        client.post.mockResolvedValueOnce({
            data: { mfa_required: false, token: 'fake-token', role: 'admin', username: 'admin1', mfa_enabled: false, allianceId: null }
        });

        renderComponent();

        // Switch Tabs
        fireEvent.click(screen.getByRole('button', { name: /Staff/i }));
        expect(screen.getByText('Admin Console')).toBeInTheDocument();

        // Fill Credentials
        fireEvent.change(screen.getByLabelText(/Username/i), { target: { value: 'admin1' } });
        fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });

        fireEvent.click(screen.getByRole('button', { name: /Access Console/i }));

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/login', { username: 'admin1', password: 'password123' });
            // login(token, role, username, mfaEnabled, allianceId)
            expect(mockLogin).toHaveBeenCalledWith('fake-token', 'admin', 'admin1', false, null);
            expect(mockNavigate).toHaveBeenCalledWith('/');
        });
    });

    it('handles multi-step MFA staff login', async () => {
        // Step 1: Require MFA
        client.post.mockResolvedValueOnce({
            data: { mfa_required: true, temp_token: 'temp123', has_webauthn: false }
        });

        // Step 2: Accept MFA code
        client.post.mockResolvedValueOnce({
            data: { token: 'final-token', role: 'moderator', allianceId: 10 }
        });

        renderComponent();
        fireEvent.click(screen.getByRole('button', { name: /Staff/i }));

        // Step 1 Submit
        fireEvent.change(screen.getByLabelText(/Username/i), { target: { value: 'mod1' } });
        fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'pass123' } });
        fireEvent.click(screen.getByRole('button', { name: /Access Console/i }));

        // Wait for Step 2 UI
        expect(await screen.findByText(/Enter your 6-digit authenticator code/i)).toBeInTheDocument();

        // Step 2 Submit
        const mfaInput = screen.getByPlaceholderText('000000');
        fireEvent.change(mfaInput, { target: { value: '123456' } });

        fireEvent.click(screen.getByRole('button', { name: /Verify Code/i }));

        await waitFor(() => {
            expect(client.post).toHaveBeenCalledWith('/login/mfa', { temp_token: 'temp123', code: '123456' });
            expect(mockLogin).toHaveBeenCalledWith('final-token', 'moderator', 'mod1', true, 10);
            expect(mockNavigate).toHaveBeenCalledWith('/');
        });
    });

    it('auto-triggers WebAuthn flow if has_webauthn is true', async () => {
        // Step 1: Login triggers WebAuthn requirement
        client.post.mockResolvedValueOnce({
            data: { mfa_required: true, temp_token: 'bio123', has_webauthn: true }
        });

        // Step 2: Fetch WebAuthn Options
        client.get.mockResolvedValueOnce({ data: { publicKey: { challenge: 'abc' } } });

        // Step 3: Browser API simulation
        startAuthentication.mockResolvedValueOnce({ id: 'credential-id' });

        // Step 4: Finish WebAuthn Login
        client.post.mockResolvedValueOnce({
            data: { token: 'bio-token', role: 'admin', allianceId: null }
        });

        renderComponent();
        fireEvent.click(screen.getByRole('button', { name: /Staff/i }));

        fireEvent.change(screen.getByLabelText(/Username/i), { target: { value: 'bioUser' } });
        fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'pass123' } });
        fireEvent.click(screen.getByRole('button', { name: /Access Console/i }));

        await waitFor(() => {
            // It should automatically call the begin route
            expect(client.get).toHaveBeenCalledWith('/webauthn/login/begin?temp_token=bio123');
            // It should call the browser native prompt
            expect(startAuthentication).toHaveBeenCalled();
            // It should finish the login and set context
            expect(client.post).toHaveBeenCalledWith('/webauthn/login/finish?temp_token=bio123', { id: 'credential-id' });
            expect(mockLogin).toHaveBeenCalledWith('bio-token', 'admin', 'bioUser', true, null);
            expect(mockNavigate).toHaveBeenCalledWith('/');
        });
    });
});