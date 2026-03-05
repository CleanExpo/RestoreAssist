"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect } from "react"
import { useRouter } from "next/navigation"

interface User {
  id: string
  email: string
  name: string
  company: string
  role: "admin" | "technician" | "manager"
  avatar?: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Dummy credentials for demo
const DEMO_USERS = {
  "demo@Restore Assist.com": {
    password: "demo123",
    user: {
      id: "1",
      email: "demo@Restore Assist.com",
      name: "Michael Chen",
      company: "Advanced Property Restoration",
      role: "admin" as const,
      avatar: "MC",
    },
  },
  "tech@Restore Assist.com": {
    password: "demo123",
    user: {
      id: "2",
      email: "tech@Restore Assist.com",
      name: "Emma Richardson",
      company: "Restore Pro QLD",
      role: "technician" as const,
      avatar: "ER",
    },
  },
  "manager@Restore Assist.com": {
    password: "demo123",
    user: {
      id: "3",
      email: "manager@Restore Assist.com",
      name: "David Patel",
      company: "Impact Restoration Services",
      role: "manager" as const,
      avatar: "DP",
    },
  },
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  // Check if user is logged in on mount
  useEffect(() => {
    const storedUser = localStorage.getItem("Restore Assist_user")
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser))
      } catch (error) {
        console.error("[v0] Failed to parse stored user:", error)
        localStorage.removeItem("Restore Assist_user")
      }
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    setIsLoading(true)
    try {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 800))

      const demoUser = DEMO_USERS[email as keyof typeof DEMO_USERS]

      if (!demoUser || demoUser.password !== password) {
        throw new Error("Invalid email or password")
      }

      setUser(demoUser.user)
      localStorage.setItem("Restore Assist_user", JSON.stringify(demoUser.user))
      // Use window.location for more reliable redirect
      window.location.href = "/dashboard"
    } catch (error) {
      console.error("[v0] Login error:", error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem("Restore Assist_user")
    // Use window.location for more reliable redirect
    window.location.href = "/login"
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
