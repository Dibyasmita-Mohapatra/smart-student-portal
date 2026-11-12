import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import api from "../services/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem("portal_user");

    if (!savedUser) {
      return null;
    }

    try {
      return JSON.parse(savedUser);
    } catch (error) {
      console.error("Invalid saved user:", error);
      localStorage.removeItem("portal_user");
      return null;
    }
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      const token = localStorage.getItem("portal_token");

      // No token = definitely logged out
      if (!token) {
        if (mounted) {
          setUser(null);
          setLoading(false);
        }

        return;
      }

      try {
        const response = await api.get("/auth/me");

        if (!mounted) {
          return;
        }

        const restoredUser = response.data?.user;

        if (!restoredUser) {
          throw new Error("Invalid user data received from /auth/me");
        }

        setUser(restoredUser);

        localStorage.setItem(
          "portal_user",
          JSON.stringify(restoredUser)
        );
      } catch (error) {
        console.error("Session restoration failed:", error);

        if (!mounted) {
          return;
        }

        localStorage.removeItem("portal_token");
        localStorage.removeItem("portal_user");

        setUser(null);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    restoreSession();

    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email, password) => {
    const response = await api.post("/auth/login", {
      email,
      password,
    });

    const {
      token,
      user: loggedInUser,
    } = response.data;

    localStorage.setItem("portal_token", token);

    localStorage.setItem(
      "portal_user",
      JSON.stringify(loggedInUser)
    );

    setUser(loggedInUser);

    return response.data;
  };

  const register = async (studentData) => {
    const response = await api.post(
      "/auth/register",
      studentData
    );

    const {
      token,
      user: registeredUser,
    } = response.data;

    localStorage.setItem("portal_token", token);

    localStorage.setItem(
      "portal_user",
      JSON.stringify(registeredUser)
    );

    setUser(registeredUser);

    return response.data;
  };

  const updateUser = (updates) => {
    setUser((current) => {
      const next = { ...(current || {}), ...updates };
      localStorage.setItem("portal_user", JSON.stringify(next));
      return next;
    });
  };

  const logout = () => {
    localStorage.removeItem("portal_token");
    localStorage.removeItem("portal_user");

    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        updateUser,
        logout,
        isAuthenticated: Boolean(user),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
};