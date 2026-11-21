import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Role } from '../types';
import { DEMO_USERS } from '../data/mockData';

interface AuthContextType {
  currentUser: User;
  allUsers: User[];
  loginAs: (userId: string) => void;
  switchRole: (role: Role) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = localStorage.getItem('certiflow_active_user');
    if (saved) {
      const found = DEMO_USERS.find((u) => u.id === saved);
      if (found) return found;
    }
    // Default to Anika (Training Centre)
    return DEMO_USERS[0];
  });

  useEffect(() => {
    localStorage.setItem('certiflow_active_user', currentUser.id);
  }, [currentUser]);

  const loginAs = (userId: string) => {
    const user = DEMO_USERS.find((u) => u.id === userId);
    if (user) {
      setCurrentUser(user);
    }
  };

  const switchRole = (role: Role) => {
    const user = DEMO_USERS.find((u) => u.role === role);
    if (user) {
      setCurrentUser(user);
    }
  };

  const logout = () => {
    setCurrentUser(DEMO_USERS[0]);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        allUsers: DEMO_USERS,
        loginAs,
        switchRole,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
