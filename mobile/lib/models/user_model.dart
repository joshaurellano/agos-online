class UserModel {
  final String id;
  final String name;
  final String username;
  final int roleId;
  final String roleDesc;
  final String? phone;

  const UserModel({
    required this.id,
    required this.name,
    required this.username,
    required this.roleId,
    required this.roleDesc,
    this.phone,
  });

  bool get isAdmin    => roleDesc == 'Admin';
  bool get isResident => roleId == 7 || roleDesc.toLowerCase() == 'resident';

  factory UserModel.fromMap(Map<String, dynamic> map) {
    return UserModel(
      id:       map['id'] ?? '',
      name:     map['name'] ?? '',
      username: map['username'] ?? '',
      roleId:   map['role_id'] ?? 0,
      roleDesc: map['roles']?['role_desc'] ?? '',
      phone:    map['phone'],
    );
  }
}