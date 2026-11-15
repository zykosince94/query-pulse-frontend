import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authConfigQuery, useDemoLogin, useLogin } from "./queries";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const demoLogin = useDemoLogin();
  const { data: config } = useQuery(authConfigQuery);

  const pending = login.isPending || demoLogin.isPending;
  const error = login.error ?? demoLogin.error;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    demoLogin.reset();
    login.mutate({ username, password });
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-primary">
          <Activity aria-hidden className="size-6" />
          <span className="text-xl font-semibold text-foreground">Query Pulse</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Database performance intelligence for PostgreSQL and MongoDB.
            </CardDescription>
          </CardHeader>

          <form onSubmit={onSubmit} noValidate>
            <CardContent className="flex flex-col gap-4">
              {error && <Alert variant="destructive">{error.message}</Alert>}

              <div className="flex flex-col gap-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={pending || !username || !password}>
                {login.isPending ? "Signing in…" : "Sign in"}
              </Button>

              {config?.demo_enabled && (
                <>
                  <div className="flex w-full items-center gap-3 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    or
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={pending}
                    onClick={() => {
                      login.reset();
                      demoLogin.mutate();
                    }}
                  >
                    {demoLogin.isPending ? "Opening the demo…" : "Try the demo"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    The demo is read-only: you can explore everything but change nothing.
                  </p>
                </>
              )}
            </CardFooter>
          </form>
        </Card>
      </div>
    </main>
  );
}
