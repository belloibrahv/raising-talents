# ADR-018: OpenTofu for infrastructure

Status: Accepted. Refines the Terraform choice in sections 2 and 18 of the design document.

## Context

The design names Terraform. Since version 1.6 HashiCorp licenses Terraform under the Business Source License. OpenTofu is the Linux Foundation fork under MPL 2.0 and reads the same configuration language.

## Decision

Write the infrastructure in standard HCL and run it with OpenTofu 1.13.

- OpenTofu encrypts state and plan files on the client with a KMS key, so read access to the state bucket alone reveals nothing. Terraform has no equivalent.
- No database or cache password is ever written to state: RDS manages the master password, and the Valkey token is generated as an ephemeral value and sent through write-only arguments.

## Alternatives considered

Terraform 1.x with the S3 backend. AWS CDK. Pulumi.

## Consequences

The modules stay Terraform-compatible apart from the `encryption` block, so switching back is a small change. CI pins the OpenTofu version. Every module is checked by `tofu validate`, TFLint with the AWS ruleset and Checkov on each pull request; any skipped Checkov finding carries its reason next to the resource.
