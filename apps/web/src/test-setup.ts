import '@testing-library/jest-dom';

// Initialize i18next with English translations so components can call t() in tests.
// This must run before any component renders.
import './i18n/i18n';
