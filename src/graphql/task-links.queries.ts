// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * GraphQL Mutations for Item Links
 */

export const ADD_INTERNAL_LINK_MUTATION = /* GraphQL */ `
  mutation AddInternalLink($addLinkInput: AddInternalLinkInput!) {
    addInternalLink(addLinkInput: $addLinkInput) {
      ... on InternalLink {
        fromItem {
          id
          name
        }
        toItem {
          id
          name
        }
        relation
        notes
      }
    }
  }
`;

export const DELETE_INTERNAL_LINK_MUTATION = /* GraphQL */ `
  mutation DeleteInternalLink($deleteLinkInput: DeleteInternalLinkInput!) {
    deleteInternalLink(deleteLinkInput: $deleteLinkInput)
  }
`;

export const ADD_EXTERNAL_LINK_MUTATION = /* GraphQL */ `
  mutation AddExternalLink($addLinkInput: AddExternalLinkInput!) {
    addExternalLink(addLinkInput: $addLinkInput) {
      ... on ExternalLink {
        fromItem {
          id
          name
        }
        url
        relation
        notes
      }
    }
  }
`;

export const DELETE_EXTERNAL_LINK_MUTATION = /* GraphQL */ `
  mutation DeleteExternalLink($deleteLinkInput: DeleteExternalLinkInput!) {
    deleteExternalLink(deleteLinkInput: $deleteLinkInput)
  }
`;
