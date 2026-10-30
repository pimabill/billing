variable "project" {
  default = "novabilling"
}

variable "region" {
  default = "us-east-1"
}

variable "environment" {
  default = "production"
}

# ── Database ──
variable "db_instance_class" {
  default = "db.t4g.micro"
}

variable "db_allocated_storage" {
  default = 20
}

variable "central_db_password" {
  type      = string
  sensitive = true
}

variable "tenant_db_password" {
  type      = string
  sensitive = true
}

# ── Auth ──
variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "jwt_refresh_secret" {
  type      = string
  sensitive = true
}

variable "encryption_key" {
  type      = string
  sensitive = true
}

# ── Email (optional) ──
variable "email_host" {
  default = ""
}

variable "email_port" {
  default = "587"
}

variable "email_user" {
  default = ""
}

variable "email_password" {
  type      = string
  default   = ""
  sensitive = true
}

variable "email_from" {
  default = "noreply@pimabill.com"
}

# ── Domain ──
variable "domain" {
  description = "Root domain (e.g. pimabill.com)"
  type        = string
}

# ── Scaling ──
variable "api_desired_count" {
  default = 2
}

variable "worker_desired_count" {
  default = 2
}

variable "api_cpu" {
  default = 256
}

variable "api_memory" {
  default = 512
}

variable "worker_cpu" {
  default = 512
}

variable "worker_memory" {
  default = 1024
}
