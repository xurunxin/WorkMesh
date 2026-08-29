'use client'

import { useEffect } from 'react'

export const WORKMESH_PRODUCT_NAME = 'WorkMesh'

export function workMeshDocumentTitle(pageTitle?: string | null): string {
  const normalized = pageTitle?.trim()
  return normalized ? `${normalized} · ${WORKMESH_PRODUCT_NAME}` : WORKMESH_PRODUCT_NAME
}

export function useWorkMeshDocumentTitle(pageTitle?: string | null): void {
  useEffect(() => {
    document.title = workMeshDocumentTitle(pageTitle)
  }, [pageTitle])
}
