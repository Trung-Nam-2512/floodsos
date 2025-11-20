import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import MapPage from './pages/MapPage'
import AdminDashboard from './pages/AdminDashboard'
import './App.css'

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<MapPage />} />
                <Route path="/report" element={<HomePage />} />
                {/* Admin route ẩn - chỉ admin biết endpoint này */}
                <Route path="/admin-secret-2025" element={<AdminDashboard />} />
            </Routes>
        </Router>
    )
}

export default App

