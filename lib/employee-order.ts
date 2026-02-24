export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  quantity: number;
}

interface AddResult {
  nextItems: OrderItem[];
  message: string | null;
}

export function addItemToOrder(orderItems: OrderItem[], menuItem: MenuItem): AddResult {
  if (menuItem.quantity <= 0) {
    return {
      nextItems: orderItems,
      message: `${menuItem.name} is out of stock.`,
    };
  }

  const existing = orderItems.find((item) => item.id === menuItem.id);
  if (!existing) {
    return {
      nextItems: [...orderItems, { ...menuItem, quantity: 1 }],
      message: null,
    };
  }

  if (existing.quantity >= menuItem.quantity) {
    return {
      nextItems: orderItems,
      message: `Only ${menuItem.quantity} ${menuItem.name} available.`,
    };
  }

  return {
    nextItems: orderItems.map((item) =>
      item.id === menuItem.id ? { ...item, quantity: item.quantity + 1 } : item
    ),
    message: null,
  };
}
