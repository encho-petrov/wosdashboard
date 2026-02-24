import {
    LayoutDashboard, Swords, Users, Calendar,
    Send, Shield, Terminal, List, LayoutGrid, UserCircle
} from 'lucide-react';

export const navLinks = [
    {
        name: 'Dashboard',
        path: '/',
        icon: LayoutDashboard,
        requiredRoles: ['admin', 'moderator'],
        description: 'System overview and redemption launcher.'
    },
    {
        name: 'War Room',
        path: '/war-room',
        icon: Swords,
        requiredRoles: ['admin', 'moderator'],
        description: 'Event deployment and troop assignments.'
    },
    {
        name: 'Squads',
        path: '/squads',
        icon: Users,
        requiredRoles: ['admin', 'moderator'],
        description: 'Manage specialized squad formations.'
    },
    {
        name: 'Ministry',
        path: '/ministry',
        icon: Calendar,
        requiredRoles: ['admin', 'moderator'],
        description: 'Buff reservations and schedule management.'
    },
    {
        name: 'Transfers',
        path: '/transfer-manager',
        icon: Send,
        requiredRoles: ['admin', 'moderator'],
        description: 'Monitor inbound and outbound movements.'
    },
    {
        name: 'Rotation',
        path: '/rotation',
        icon: LayoutGrid,
        requiredRoles: ['admin', 'moderator'],
        description: 'Fortress and Stronghold season planning.'
    },
    {
        name: 'Roster',
        path: '/roster',
        icon: List,
        requiredRoles: ['admin', 'moderator'],
        description: 'Full player database and attribute editing.'
    },
    {
        name: 'Alliances',
        path: '/alliances',
        icon: Shield,
        requiredRoles: ['admin'],
        description: 'Configure state alliance entities.'
    },
    {
        name: 'Audit Logs',
        path: '/audit-logs',
        icon: Terminal,
        requiredRoles: ['admin'],
        description: 'Review administrative action history.'
    },
    {
        name: 'Users',
        path: '/users',
        icon: Users,
        requiredRoles: ['admin'],
        description: 'User administration.'
    },
    {
        name: 'User Profile',
        path: '/profile',
        icon: UserCircle,
        requiredRoles: ['admin', 'moderator'],
        description: 'User profile.'
    }
];