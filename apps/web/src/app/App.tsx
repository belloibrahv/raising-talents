import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { UpdatePrompt } from '../shared/pwa/UpdatePrompt';
import { createQueryClient } from './query-client';
import { buildRoutes } from './routes';

const router = createBrowserRouter(buildRoutes(<UpdatePrompt />));

export function App() {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
