import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Settings, LogOut, ChevronDown, CreditCard, HelpCircle, Bell } from 'lucide-react';
import { setUser as setSentryUser } from '../sentry';
import { signOutCompletely } from '../utils/signOut';

export const UserMenu: React.FC = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Get user info from localStorage
  const userEmail = localStorage.getItem('userEmail') || localStorage.getItem('user') && JSON.parse(localStorage.getItem('user')!).email || 'user@example.com';
  const userName = localStorage.getItem('userName') || localStorage.getItem('user') && JSON.parse(localStorage.getItem('user')!).name || 'User';

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = () => {
    // Clear Sentry user context first
    setSentryUser(null);

    // Close menu
    setIsOpen(false);

    // Use the PROPER sign-out function that ACTUALLY works
    signOutCompletely();
  };

  // Get user initials (first letter of first name and last name if available)
  const getInitials = () => {
    const nameParts = userName.split(' ');
    if (nameParts.length >= 2) {
      return `${nameParts[0].charAt(0)}${nameParts[1].charAt(0)}`.toUpperCase();
    }
    return userName.charAt(0).toUpperCase();
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* User Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group flex items-center space-x-3 px-3 py-2 rounded-xl hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-all duration-200 backdrop-blur-sm"
      >
        {/* Avatar with status indicator */}
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg ring-2 ring-white dark:ring-gray-900 group-hover:ring-blue-500/50 transition-all duration-200">
            {getInitials()}
          </div>
          {/* Online status indicator */}
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white dark:border-gray-900 shadow-sm"></div>
        </div>

        {/* User info - hidden on mobile */}
        <div className="hidden lg:block text-left">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">
            {userName}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">
            {userEmail.length > 24 ? userEmail.substring(0, 24) + '...' : userEmail}
          </p>
        </div>

        {/* Chevron icon */}
        <ChevronDown
          className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-all duration-300 ${
            isOpen ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop overlay for mobile */}
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsOpen(false)} />

          {/* Menu */}
          <div className="absolute right-0 mt-3 w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700/50 z-50 overflow-hidden animate-slideDown">
            {/* Gradient header */}
            <div className="relative bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 px-6 py-8">
              <div className="absolute inset-0 bg-black/10"></div>
              <div className="relative flex items-start space-x-4">
                {/* Large avatar */}
                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white font-bold text-2xl shadow-xl ring-4 ring-white/30">
                  {getInitials()}
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <p className="text-lg font-bold text-white truncate">
                    {userName}
                  </p>
                  <p className="text-sm text-blue-100 truncate">
                    {userEmail}
                  </p>
                  <div className="mt-2 inline-flex items-center space-x-1.5 px-2.5 py-1 bg-white/20 backdrop-blur-sm rounded-full">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <span className="text-xs font-medium text-white">Active</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Menu items */}
            <div className="p-2">
              {/* Account section */}
              <div className="mb-1">
                <p className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Account
                </p>
                <Link
                  to="/settings"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center space-x-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 group"
                >
                  <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 flex items-center justify-center transition-colors">
                    <Settings className="w-4.5 h-4.5 text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Account Settings
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Manage your account
                    </p>
                  </div>
                </Link>

                <Link
                  to="/subscription"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center space-x-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 group"
                >
                  <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/30 flex items-center justify-center transition-colors">
                    <CreditCard className="w-4.5 h-4.5 text-gray-600 dark:text-gray-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Subscription
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Manage billing
                    </p>
                  </div>
                </Link>
              </div>

              {/* Support section */}
              <div className="mt-1 mb-1">
                <p className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Support
                </p>
                <Link
                  to="/contact"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center space-x-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 group"
                >
                  <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 group-hover:bg-green-100 dark:group-hover:bg-green-900/30 flex items-center justify-center transition-colors">
                    <HelpCircle className="w-4.5 h-4.5 text-gray-600 dark:text-gray-400 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Help & Support
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Get help
                    </p>
                  </div>
                </Link>
              </div>

              {/* Divider */}
              <div className="my-2 border-t border-gray-200 dark:border-gray-700"></div>

              {/* Sign out button */}
              <button
                onClick={handleSignOut}
                className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200 group"
              >
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 group-hover:bg-red-100 dark:group-hover:bg-red-900/30 flex items-center justify-center transition-colors">
                  <LogOut className="w-4.5 h-4.5 text-gray-600 dark:text-gray-400 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                    Sign Out
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    End your session
                  </p>
                </div>
              </button>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700/50">
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                RestoreAssist v1.0 • <Link to="/privacy" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Privacy</Link>
              </p>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slideDown {
          animation: slideDown 0.2s ease-out;
        }
      `}</style>
    </div>
  );
};
