import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { AuthService } from '../services/authService';

export const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { setUser, setSession } = useAppStore();

  const handleGoogleSignIn = async () => {
    const { data, error } = await AuthService.signInWithGoogle();
    if (error) {
      Alert.alert('Login Error', error.message);
    } else if (data?.session) {
      setUser(data.session.user);
      setSession(data.session);
    }
  };

  const handleEmailSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter email and password');
      return;
    }
    const { data, error } = await AuthService.signInWithEmail(email, password);
    if (error) {
      Alert.alert('Login Error', error.message);
    } else if (data?.session) {
      setUser(data.session.user);
      setSession(data.session);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Washroom Safety – Sign In</Text>
      <Button title="Sign in with Google" onPress={handleGoogleSignIn} />
      <Text style={styles.or}>OR</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Button title="Sign in with Email" onPress={handleEmailSignIn} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    height: 48,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  or: {
    textAlign: 'center',
    marginVertical: 12,
    fontSize: 16,
    color: '#666',
  },
});
