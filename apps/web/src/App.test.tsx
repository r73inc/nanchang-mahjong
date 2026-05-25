import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('Foundation·smoke: app shell renders brand name', () => {
    render(<App />);
    expect(screen.getByText('南昌麻将')).toBeInTheDocument();
    expect(screen.getByText('Nanchang Mahjong')).toBeInTheDocument();
  });
});
