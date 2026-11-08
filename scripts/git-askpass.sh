#!/bin/sh
# Git credential helper for the in-app publish endpoint.
# The token is supplied through the environment so it never appears in a process
# list or shell history. Only the password prompt is answered.
case "$1" in
  *Username*) echo "x-access-token" ;;
  *Password*) echo "$VOCALIS_GIT_TOKEN" ;;
  *) echo "" ;;
esac
