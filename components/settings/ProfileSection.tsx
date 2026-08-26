"use client";

import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { useAuth } from "@/lib/context/AuthContext";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";

export function ProfileSection() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    updateProfile({ name: name.trim() || user?.name, email: email.trim() || user?.email });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-4">
        <Avatar name={user?.name ?? "?"} size="lg" />
        <div>
          <h2 className="font-display text-lg font-semibold text-text">Profile</h2>
          <p className="text-[15px] text-muted">
            {user?.isGuest ? "You're browsing as a guest." : "Update your display name and email."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <Input
          label="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={user?.isGuest}
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={user?.isGuest}
        />
        {!user?.isGuest && (
          <div className="flex items-center gap-3">
            <Button type="submit">Save changes</Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm font-medium text-general">
                <Check className="h-4 w-4" aria-hidden />
                Saved
              </span>
            )}
          </div>
        )}
        {user?.isGuest && (
          <p className="text-[15px] text-faint">Create an account to edit your profile and keep your chat history.</p>
        )}
      </form>
    </Card>
  );
}
