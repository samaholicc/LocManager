import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import ComplaintsViewer from '../ComplaintsViewer';
import { ThemeProvider } from '../context/ThemeContext';

// Mock the ThemeContext
const mockThemeContext = {
  darkMode: false,
  toggleDarkMode: jest.fn(),
};

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(() => JSON.stringify({ username: 'o-123' })),
};

// Mock axios
const mockAxios = new MockAdapter(axios);

const mockComplaints = [
  { room_no: 101, complaints: 'Leaky faucet', resolved: false },
  { room_no: 102, complaints: 'Broken window', resolved: false },
  { room_no: 103, complaints: 'Noisy neighbor', resolved: true },
];

// Helper to render component with context
const renderWithContext = (ui) => {
  return render(
    <ThemeProvider value={mockThemeContext}>
      {ui}
    </ThemeProvider>
  );
};

describe('ComplaintsViewer', () => {
  beforeEach(() => {
    mockAxios.reset();
    jest.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(mockLocalStorage.getItem);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders loading state initially', () => {
    renderWithContext(<ComplaintsViewer />);
    expect(screen.getByRole('status')).toBeInTheDocument(); // Spinner
  });

  test('displays error message on fetch failure', async () => {
    mockAxios.onPost(`${process.env.REACT_APP_SERVER}/ownercomplaints`).reply(500, {
      error: 'Server error',
    });

    renderWithContext(<ComplaintsViewer />);
    await waitFor(() => {
      expect(screen.getByText(/Server error/i)).toBeInTheDocument();
    });
  });

  test('displays complaints after successful fetch', async () => {
    mockAxios.onPost(`${process.env.REACT_APP_SERVER}/ownercomplaints`).reply(200, mockComplaints);

    renderWithContext(<ComplaintsViewer />);
    await waitFor(() => {
      expect(screen.getByText(/Plaintes \(3\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Chambre 101/i)).toBeInTheDocument();
      expect(screen.getByText(/Leaky faucet/i)).toBeInTheDocument();
      expect(screen.getByText(/Chambre 102/i)).toBeInTheDocument();
      expect(screen.getByText(/Broken window/i)).toBeInTheDocument();
    });
  });

  test('filters unresolved complaints', async () => {
    mockAxios.onPost(`${process.env.REACT_APP_SERVER}/ownercomplaints`).reply(200, mockComplaints);

    renderWithContext(<ComplaintsViewer />);
    await waitFor(() => {
      expect(screen.getByText(/Plaintes \(3\)/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/Afficher uniquement les plaintes non résolues/i));
    await waitFor(() => {
      expect(screen.getByText(/Plaintes \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Chambre 101/i)).toBeInTheDocument();
      expect(screen.getByText(/Chambre 102/i)).toBeInTheDocument();
      expect(screen.queryByText(/Chambre 103/i)).not.toBeInTheDocument();
    });
  });

  test('searches complaints by room number', async () => {
    mockAxios.onPost(`${process.env.REACT_APP_SERVER}/ownercomplaints`).reply(200, mockComplaints);

    renderWithContext(<ComplaintsViewer />);
    await waitFor(() => {
      expect(screen.getByText(/Plaintes \(3\)/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Rechercher par chambre ou plainte/i);
    fireEvent.change(searchInput, { target: { value: '101' } });

    await waitFor(() => {
      expect(screen.getByText(/Plaintes \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Chambre 101/i)).toBeInTheDocument();
      expect(screen.queryByText(/Chambre 102/i)).not.toBeInTheDocument();
    });
  });

  test('sorts complaints by room number', async () => {
    mockAxios.onPost(`${process.env.REACT_APP_SERVER}/ownercomplaints`).reply(200, mockComplaints);

    renderWithContext(<ComplaintsViewer />);
    await waitFor(() => {
      expect(screen.getByText(/Plaintes \(3\)/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Numéro de chambre/i));
    await waitFor(() => {
      const rooms = screen.getAllByText(/Chambre/i).map((el) => el.textContent);
      expect(rooms[0]).toBe('Chambre 103');
      expect(rooms[1]).toBe('Chambre 102');
      expect(rooms[2]).toBe('Chambre 101');
    });
  });

  test('resolves a complaint', async () => {
    mockAxios.onPost(`${process.env.REACT_APP_SERVER}/ownercomplaints`).reply(200, mockComplaints);
    mockAxios.onPost(`${process.env.REACT_APP_SERVER}/deletecomplaint`).reply(200);

    renderWithContext(<ComplaintsViewer />);
    await waitFor(() => {
      expect(screen.getByText(/Plaintes \(3\)/i)).toBeInTheDocument();
    });

    const resolveButton = screen.getAllByText(/Résoudre/i)[0];
    fireEvent.click(resolveButton);

    await waitFor(() => {
      expect(screen.getByText(/Résolu/i)).toBeInTheDocument();
      expect(resolveButton).toBeDisabled();
    });
  });

  test('handles pagination', async () => {
    const manyComplaints = Array.from({ length: 7 }, (_, i) => ({
      room_no: 101 + i,
      complaints: `Issue ${i + 1}`,
      resolved: false,
    }));
    mockAxios.onPost(`${process.env.REACT_APP_SERVER}/ownercomplaints`).reply(200, manyComplaints);

    renderWithContext(<ComplaintsViewer />);
    await waitFor(() => {
      expect(screen.getByText(/Plaintes \(7\)/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText(/Chambre/i).length).toBe(6); // First page
    fireEvent.click(screen.getByText('2'));
    await waitFor(() => {
      expect(screen.getByText(/Chambre 107/i)).toBeInTheDocument();
    });
  });

  test('displays no complaints message when none exist', async () => {
    mockAxios.onPost(`${process.env.REACT_APP_SERVER}/ownercomplaints`).reply(200, []);

    renderWithContext(<ComplaintsViewer />);
    await waitFor(() => {
      expect(screen.getByText(/Pas de plainte trouvée/i)).toBeInTheDocument();
    });
  });
});