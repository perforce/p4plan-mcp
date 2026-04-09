// Copyright (c) 2026, Perforce Software, Inc. All rights reserved.
// Licensed under the MIT License. See LICENSE.txt in the project root.

/**
 * GraphQL Queries and Mutations for Comments and Attachments
 */

export const GET_COMMENTS_QUERY = /* GraphQL */ `
  query GetComments($id: ID!) {
    comments(id: $id) {
      id
      text
      postedBy {
        id
        name
      }
      postedAt
    }
  }
`;

export const POST_COMMENT_MUTATION = /* GraphQL */ `
  mutation PostComment($input: PostCommentInput!) {
    postComment(postCommentInput: $input) {
      id
      text
      postedBy {
        id
        name
      }
      postedAt
    }
  }
`;

export const GET_ATTACHMENTS_QUERY = /* GraphQL */ `
  query GetAttachments($id: ID!) {
    item(id: $id) {
      id
      name
      ... on Task {
        attachments {
          id
          path
          size
          version
          imageWidth
          imageHeight
          coverImage
          addedBy {
            id
            name
          }
          date
        }
      }
    }
  }
`;

export const DELETE_ATTACHMENT_MUTATION = /* GraphQL */ `
  mutation DeleteAttachment($itemID: ID!, $path: String!) {
    deleteItemAttachment(itemID: $itemID, path: $path)
  }
`;

export const SET_COVER_IMAGE_MUTATION = /* GraphQL */ `
  mutation SetCoverImage($itemID: ID!, $path: String) {
    updateItemCoverImage(itemID: $itemID, path: $path)
  }
`;

export const UPDATE_COMMENT_MUTATION = /* GraphQL */ `
  mutation UpdateComment($input: UpdateCommentInput!) {
    updateComment(updateCommentInput: $input) {
      id
      text
      postedBy {
        id
        name
      }
      postedAt
    }
  }
`;

export const DELETE_COMMENT_MUTATION = /* GraphQL */ `
  mutation DeleteComment($input: DeleteCommentInput!) {
    deleteComment(deleteCommentInput: $input)
  }
`;
