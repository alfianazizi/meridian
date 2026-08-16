import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Shell} from './app';
const queryClient=new QueryClient({defaultOptions:{queries:{retry:1,staleTime:15000}}});
createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><Shell/></BrowserRouter></QueryClientProvider></React.StrictMode>);
