#!/usr/bin/env python3
"""Development seed data (stub — Phase 0).

Real seeding requires the Phase 1 migration set (users, workspaces,
memberships, matters, matter_links, actors, matter_actor_roles). Target
content is defined in the Database Schema Draft §10 (sample seed data):
one NY workspace, two merits matters + one Part 81 overlay proceeding,
and a handful of actors.
"""


def main() -> None:
    print("seed_dev_data: not implemented yet.")
    print("Depends on: Phase 1 migrations (see handoff/BACKLOG.md P1).")
    print("Seed content spec: docs/specs/Legal_Matter_Intelligence_Database_Schema_Draft.md §10")


if __name__ == "__main__":
    main()
