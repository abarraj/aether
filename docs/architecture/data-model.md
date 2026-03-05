# Data Model

Aether is a multi-tenant SaaS platform.

Every business object must be scoped by `org_id`.

Core objects:

Organization
- tenant company

Membership
- user ↔ organization relationship
- role based access

DataStream
- connected dataset or uploaded file

StreamVersion
- immutable dataset version

DataRow
- raw ingested data

Entity
- normalized business object

Relationship
- links between entities

MetricDefinition
- formula specification

MetricSnapshot
- computed metric result

Target
- expected value or threshold

Alert
- triggered when metric crosses threshold

AIConversation
- chat session tied to org + user
