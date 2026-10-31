import type {
  AuthUser,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UserRole,
} from "@brightloop/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";

export const meQueryKey = ["auth", "me"] as const;

/** The signed-in user, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async ({ signal }) => {
      try {
        const { user } = await api<{ user: AuthUser }>("/api/auth/me", { signal });
        return user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** The signed-in user inside a route guarded by <RequireRole>, which guarantees one exists. */
export function useRequiredUser(): AuthUser {
  const { data } = useMe();
  if (!data) throw new Error("useRequiredUser must be used inside a <RequireRole> route");
  return data;
}

/** Where a user lands after signing in. */
export function homePathFor(role: UserRole): string {
  return role === "customer" ? "/portal" : "/dashboard";
}

function useSignIn<I>(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: I) => api<{ user: AuthUser }>(path, { method: "POST", body: input }),
    onSuccess: ({ user }) => {
      // Drop anything cached for a previous user before storing the new one.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== meQueryKey[0] });
      queryClient.setQueryData(meQueryKey, user);
    },
  });
}

export const useLogin = () => useSignIn<LoginInput>("/api/auth/login");
export const useRegister = () => useSignIn<RegisterInput>("/api/auth/register");

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ csrfToken: string }>("/api/auth/logout", { method: "POST" }),
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(meQueryKey, null);
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: ForgotPasswordInput) =>
      api<{ ok: true; message: string }>("/api/auth/forgot-password", { method: "POST", body: input }),
  });
}

export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResetPasswordInput) =>
      api<{ ok: true }>("/api/auth/reset-password", { method: "POST", body: input }),
    // The API revokes every session, including this browser's.
    onSuccess: () => queryClient.setQueryData(meQueryKey, null),
  });
}
