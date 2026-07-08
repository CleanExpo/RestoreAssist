// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrandCard } from '../BrandCard';
import { useSetupStore } from '../store';

const TEST_ORG = {
  id: 'org-1', legalName: 'Acme', tradingName: null, abn: '53004085616', acn: null,
  state: 'NSW', address: null, phone: null, email: null, website: null,
  logoUrl: null, primaryColor: null, accentColor: null, aboutCopy: null,
  tradingStatus: 'ACTIVE' as const,
  setupStartedAt: null, setupCompletedAt: null,
};

describe('BrandCard', () => {
  beforeEach(() => {
    useSetupStore.getState().reset();
    useSetupStore.getState().setOrg(TEST_ORG);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { updated: [] } }) }) as never;
  });

  it('renders pending placeholder when status is pending', () => {
    render(<BrandCard />);
    expect(screen.getByText(/waiting for your abn/i)).toBeInTheDocument();
  });

  it('renders running skeleton when status is running', () => {
    useSetupStore.getState().setSectionStatus('branding', 'running');
    render(<BrandCard />);
    expect(screen.getByText(/pulling your logo and brand/i)).toBeInTheDocument();
  });

  it('renders editable swatches and textarea when status is ready', () => {
    useSetupStore.getState().setOrg({ ...TEST_ORG, primaryColor: '#aabbcc', accentColor: '#ddeeff' });
    useSetupStore.getState().setSectionStatus('branding', 'ready');
    render(<BrandCard />);
    expect(screen.getByLabelText(/primary colour picker/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/accent colour picker/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/about your business/i)).toBeInTheDocument();
  });

  it('PATCH /api/setup/state is called when primary colour changes', async () => {
    useSetupStore.getState().setSectionStatus('branding', 'ready');
    render(<BrandCard />);
    const primary = screen.getByLabelText(/primary colour picker/i);
    fireEvent.change(primary, { target: { value: '#112233' } });
    await new Promise((r) => setTimeout(r, 50));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/setup/state',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('primaryColor'),
      }),
    );
  });

  it('renders manual upload UI in manual status', () => {
    useSetupStore.getState().setSectionStatus('branding', 'manual');
    render(<BrandCard />);
    expect(screen.getByLabelText(/upload or replace logo/i)).toBeInTheDocument();
  });

  describe('logo upload', () => {
    const CLOUDINARY_URL = 'https://res.cloudinary.com/demo/business-logos/acme.png';

    const pickFile = (file: File) => {
      fireEvent.change(screen.getByLabelText(/logo file/i), { target: { files: [file] } });
    };

    beforeEach(() => {
      useSetupStore.getState().setSectionStatus('branding', 'manual');
    });

    it('uploads via /api/upload/logo and persists the returned URL to setup state', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === '/api/upload/logo') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, url: CLOUDINARY_URL }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { updated: ['logoUrl'] } }),
        });
      }) as never;

      render(<BrandCard />);
      pickFile(new File(['png-bytes'], 'logo.png', { type: 'image/png' }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/upload/logo',
          expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
        );
      });
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/setup/state',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ logoUrl: CLOUDINARY_URL }),
          }),
        );
      });
      // Optimistic store update drives the preview
      expect(useSetupStore.getState().org?.logoUrl).toBe(CLOUDINARY_URL);
      expect(screen.getByAltText(/business logo/i)).toHaveAttribute('src', CLOUDINARY_URL);
    });

    it('shows the server error and skips persistence when the upload is rejected', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Invalid file type. Only images are allowed.' } }),
      }) as never;

      render(<BrandCard />);
      pickFile(new File(['not-really-png'], 'fake.png', { type: 'image/png' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/only images are allowed/i);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(useSetupStore.getState().org?.logoUrl).toBeNull();
    });

    it('rejects non-image types client-side without calling fetch', async () => {
      render(<BrandCard />);
      pickFile(new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/png, jpeg, gif, or webp/i);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects files over 5MB client-side without calling fetch', async () => {
      const bigFile = new File(['x'], 'huge.png', { type: 'image/png' });
      Object.defineProperty(bigFile, 'size', { value: 5 * 1024 * 1024 + 1 });

      render(<BrandCard />);
      pickFile(bigFile);

      expect(await screen.findByRole('alert')).toHaveTextContent(/5mb or smaller/i);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('surfaces a persistence failure after a successful upload', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === '/api/upload/logo') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, url: CLOUDINARY_URL }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 409,
          json: async () => ({ error: { message: 'Setup already complete; edit in Settings instead' } }),
        });
      }) as never;

      render(<BrandCard />);
      pickFile(new File(['png-bytes'], 'logo.png', { type: 'image/png' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/setup already complete/i);
    });
  });
});
