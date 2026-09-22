import { createContext, useContext, useState, useEffect } from 'react';

const DataSourceContext = createContext(null);

const STORAGE_KEY = 'agos-data-source';

// Base URLs for the flood prediction / forecast model API.
// 'live'  -> the actual deployed model server
// 'mock'  -> the mock server used for demos/presentations (same endpoints/shape)
export const API_BASE_URLS = {
  live: import.meta.env.VITE_LIVE_URL,
  mock: import.meta.env.VITE_MOCK_URL
};

export function DataSourceProvider({ children }) {
  const [dataSource, setDataSourceState] = useState(() => {
    // Mock mode is a dev-only convenience — never honor a leftover
    // 'mock' value from localStorage in a production build, so prod
    // always starts on (and stays on) live data even if this browser
    // previously ran the dev build with mock selected.
    if (!import.meta.env.DEV) return 'live';
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'mock' ? 'mock' : 'live';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, dataSource);
  }, [dataSource]);

  const setDataSource = (source) => {
    if (!import.meta.env.DEV) return; // dev-only, see note above
    if (source === 'live' || source === 'mock') {
      setDataSourceState(source);
    }
  };

  const toggleDataSource = () => {
    if (!import.meta.env.DEV) return; // dev-only, see note above
    setDataSourceState((prev) => (prev === 'live' ? 'mock' : 'live'));
  };

  const value = {
    dataSource,                       // 'live' | 'mock'
    isMock: dataSource === 'mock',
    apiBaseUrl: API_BASE_URLS[dataSource],
    setDataSource,
    toggleDataSource,
  };

  return (
    <DataSourceContext.Provider value={value}>
      {children}
    </DataSourceContext.Provider>
  );
}

export const useDataSource = () => useContext(DataSourceContext);
