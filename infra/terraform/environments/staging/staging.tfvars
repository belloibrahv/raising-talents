aws_account_id = "000000000000" # Replace with the staging account id before the first plan.

# Ireland until the latency test in ADR-015 picks between eu-west-1 and af-south-1.
# Changing region later means rebuilding staging, so run the test before first apply.
aws_region = "eu-west-1"

environment        = "staging"
root_domain        = "raisingtalents.app"
subdomain          = "staging"
vpc_cidr_block     = "10.40.0.0/16"
single_nat_gateway = true

database = {
  instance_class        = "db.t4g.small"
  multi_az              = false
  backup_retention_days = 7
}

cache = {
  node_type  = "cache.t4g.micro"
  node_count = 1
}

api = {
  cpu       = 512
  memory    = 1024
  min_count = 1
  max_count = 3
}

# The worker shuts down cleanly on SIGTERM and the outbox retries, so Spot's
# two-minute interruption notice costs nothing but a short delay.
worker = {
  cpu               = 256
  memory            = 512
  count             = 1
  capacity_provider = "FARGATE_SPOT"
}

alert_emails       = [] # Add the on-call addresses before the first plan. Validation fails until you do.
monthly_budget_usd = 250
