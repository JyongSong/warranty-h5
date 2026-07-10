export type FetchedInstallationOrderItem = {
  item_code: string | null
  item_name: string | null
  quantity: number | null
}

export type FetchedInstallationOrder = {
  source_key: string
  customer_name: string | null
  phone: string | null
  address: string | null
  order_numbers: string | null
  no_girl: string | null
  due_date: string | null
  memo: string | null
  source_error_code?: string | null
}

export type FetchInstallationOrdersSuccessResponse = {
  data: FetchedInstallationOrder[]
}

export type FetchInstallationOrdersErrorResponse = {
  error: string
}

export type FetchInstallationOrdersResponse =
  | FetchInstallationOrdersSuccessResponse
  | FetchInstallationOrdersErrorResponse
