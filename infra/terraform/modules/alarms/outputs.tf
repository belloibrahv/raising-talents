output "topic_arn" {
  description = "Alert topic, for other alarms to publish to."
  value       = aws_sns_topic.alerts.arn
}
