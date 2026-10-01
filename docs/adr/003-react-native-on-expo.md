# ADR-003: React Native on Expo

Status: Accepted

## Context

The client wants a production mobile app. The team writes TypeScript across the stack.

## Decision

React Native with Expo SDK 57, the New Architecture and Expo Router.

## Alternatives considered

Flutter; separate native iOS and Android apps.

## Consequences

One language across app, API and admin, with shared contracts. EAS handles builds and updates.
