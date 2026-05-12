// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StorageCard } from '../StorageCard';
import { useSetupStore } from '../store';

describe('StorageCard', () => {
  beforeEach(() => {
    useSetupStore.getState().reset();
    // jsdom: stub location.href setter so we can assert without navigating
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: '' },
    });
  });

  it('renders all 3 storage options', () => {
    render(<StorageCard />);
    expect(screen.getByLabelText(/google drive/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/onedrive/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/keep it local/i)).toBeInTheDocument();
  });

  it('OneDrive option is disabled (coming soon)', () => {
    render(<StorageCard />);
    expect(screen.getByLabelText(/onedrive/i)).toBeDisabled();
  });

  it('clicking Keep it local marks storage section as ready', () => {
    render(<StorageCard />);
    fireEvent.click(screen.getByLabelText(/keep it local/i));
    expect(useSetupStore.getState().sections.storage).toBe('ready');
  });

  it('clicking Drive navigates to OAuth start path', () => {
    render(<StorageCard />);
    fireEvent.click(screen.getByLabelText(/google drive/i));
    expect(window.location.href).toContain('/api/oauth/google-drive/start');
  });
});
