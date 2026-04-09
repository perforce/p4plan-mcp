// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * GraphQL Queries and Mutations Index
 *
 * This module exports all GraphQL operations organized by domain.
 * Import specific queries/mutations from their respective modules,
 * or use this index for convenient access to all operations.
 */

// Authentication
export * from './auth.queries';

// Projects
export * from './project.queries';

// Users
export * from './user.queries';

// Task CRUD Operations
export * from './task-crud.queries';

// Task Listings
export * from './task-items.queries';

// Comments and Attachments
export * from './task-comments.queries';

// Custom Fields and Workflows
export * from './task-custom-fields.queries';

// Task Actions (Commit to Sprint, Assign, Create Bug)
export * from './task-actions.queries';

export * from './task-links.queries';
