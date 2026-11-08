import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { PetWindow } from './PetWindow'
import './styles.css'

const view = new URLSearchParams(window.location.search).get('view')
createRoot(document.getElementById('root')!).render(<React.StrictMode>{view === 'pet' ? <PetWindow /> : <App />}</React.StrictMode>)
