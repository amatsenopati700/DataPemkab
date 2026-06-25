// Types for CKAN API responses

export interface CKANOrganization {
  id: string;
  name: string;
  title: string;
  description: string;
  image_url: string;
  package_count: number;
  created: string;
  is_organization: boolean;
  approval_status: string;
  state: string;
}

export interface CKANResource {
  id: string;
  name: string;
  format: string;
  size: number | null;
  url: string;
  mimetype: string | null;
  hash: string;
  url_type: string | null;
  resource_type: string | null;
  cache_last_updated: string | null;
  cache_url: string | null;
  created: string;
  last_modified: string | null;
  metadata_modified: string;
  state: string;
  package_id: string;
  position: number;
  datastore_active: boolean;
  mimetype_inner: string | null;
}

export interface CKANPackage {
  id: string;
  name: string;
  title: string | null;
  notes: string | null;
  author: string;
  author_email: string;
  license_id: string;
  license_title: string;
  maintainer: string;
  maintainer_email: string;
  state: string;
  url: string;
  version: string;
  isopen: boolean;
  creator_user_id: string;
  metadata_created: string;
  metadata_modified: string;
  num_resources: number;
  num_tags: number;
  owner_org: string;
  organization: {
    id: string;
    name: string;
    title: string;
    type: string;
    description: string;
    image_url: string;
    created: string;
    is_organization: boolean;
    approval_status: string;
    state: string;
  } | null;
  resources: CKANResource[];
  tags: {
    id: string;
    name: string;
    display_name: string;
    state: string;
    vocabulary_id: string | null;
  }[];
  extras: { key: string; value: string }[];
  groups: unknown[];
  relationships_as_subject: unknown[];
  relationships_as_object: unknown[];
}

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rowCount: number;
  colCount: number;
  colTypes: string[];
  rows: { rowIndex: number; values: string[] }[];
}

export interface IngestionState {
  phase: 'idle' | 'organizations' | 'metadata' | 'download' | 'parsing' | 'markdown' | 'complete' | 'error';
  current: number;
  total: number;
  currentItem: string;
  status: string;
  errors: number;
  success: number;
  skipped: number;
  startedAt: string | null;
}