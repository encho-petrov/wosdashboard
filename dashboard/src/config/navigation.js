import {
    LayoutDashboard, Swords, Users, Calendar, Crown,
    Send, Shield, Terminal, List, LayoutGrid, UserCircle,
    History
} from 'lucide-react';

export const navLinks = [
    {
        name: 'Dashboard',
        path: '/',
        icon: LayoutDashboard,
        requiredRoles: ['admin', 'moderator'],
        description: 'System overview and redemption launcher.',
        requiresAlliance: false
    },
    {
        name: 'Roster',
        path: '/roster',
        icon: List,
        requiredRoles: ['admin', 'moderator'],
        description: 'Full player database and attribute editing.',
        requiresAlliance: false
    },
    {
        name: 'War Room',
        path: '/war-room',
        icon: Swords,
        requiredRoles: ['admin', 'moderator'],
        description: 'Event deployment and troop assignments.',
        requiresAlliance: false
    },
    {
        name: 'Squads',
        path: '/squads',
        icon: Users,
        requiredRoles: ['admin', 'moderator'],
        description: 'Manage specialized squad formations.',
        requiresAlliance: false
    },
    {
        name: 'Strategy',
        path: '/strategy',
        icon: Crown,
        requiredRoles: ['admin', 'moderator'],
        description: 'Event deployment and troop assignments.',
        requiresAlliance: false
    },
    {
        name: 'Event History',
        path: '/event-history',
        icon: History,
        requiredRoles: ['admin','moderator'],
        description: 'Event history assignments.',
        requiresAlliance: false
    },
    {
        name: 'Ministry',
        path: '/ministry',
        icon: Calendar,
        requiredRoles: ['admin', 'moderator'],
        description: 'Buff reservations and schedule management.',
        requiresAlliance: false
    },
    {
        name: 'Transfers',
        path: '/transfer-manager',
        icon: Send,
        requiredRoles: ['admin', 'moderator'],
        description: 'Monitor inbound and outbound movements.',
        requiresAlliance: false
    },
    {
        name: 'Rotation',
        path: '/rotation',
        icon: LayoutGrid,
        requiredRoles: ['admin', 'moderator'],
        description: 'Fortress and Stronghold season planning.',
        requiresAlliance: false
    },
    {
        name: 'Alliances',
        path: '/alliances',
        icon: Shield,
        requiredRoles: ['admin'],
        description: 'Configure state alliance entities.',
        requiresAlliance: false
    },
    {
        name: 'Audit Logs',
        path: '/audit-logs',
        icon: Terminal,
        requiredRoles: ['admin'],
        description: 'Review administrative action history.',
        requiresAlliance: false
    },
    {
        name: 'Users',
        path: '/users',
        icon: Users,
        requiredRoles: ['admin'],
        description: 'User administration.',
        requiresAlliance: false
    },
    {
        name: 'User Profile',
        path: '/profile',
        icon: UserCircle,
        requiredRoles: ['admin', 'moderator'],
        description: 'User profile.',
        requiresAlliance: false
    }
];